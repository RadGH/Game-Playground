// The defence's lit things on the Tactical Scope (PLAN M4): enemies, tower shots (bolts, tracer rounds, mortar shells
// on their arc), acid spit, hit sparks and death splats. Drawn through the scope's painter hook (js/render/scope.js
// addPainter) as the same lit points debris uses, so they light the ground and bloom like everything else.
// Enemies arrive each frame as a Float32Array [id, x, y, type, hpShare, state] (only those on live sight — the worker
// never sends what the scope could not see) and are drawn interpolated between snapshots.

const TYPES = ['skitter', 'gnasher', 'spitter', 'carapace'];
export const FOE_TYPE = Object.fromEntries(TYPES.map((t, i) => [t, i]));
const BODY = [
  // dark chitin with bright eyes: a crawler must read against grass, sand and rubble alike
  { size: 1.5, col: [0.16, 0.17, 0.07], eye: [1.6, 1.5, 0.45], leg: 2.8 },
  { size: 2.5, col: [0.24, 0.15, 0.08], eye: [1.8, 0.9, 0.3], leg: 3.8 },
  { size: 1.7, col: [0.14, 0.2, 0.1], eye: [0.9, 1.8, 0.4], leg: 2.8, sac: true },
  { size: 4.2, col: [0.11, 0.1, 0.08], eye: [1.9, 0.6, 0.25], leg: 6 },
];

export function createFoePainter() {
  let foes = new Float32Array(0), prev = new Map(), at = 0, dt = 50;
  const fx = [];   // { k, x, y, x2, y2, born, life }
  function setFoes(arr, nowMs) {
    const p = new Map();
    for (let k = 0; k < foes.length; k += 6) p.set(foes[k], [foes[k + 1], foes[k + 2]]);
    prev = p;
    if (at) dt = Math.max(16, Math.min(250, nowMs - at));
    foes = arr; at = nowMs;
  }
  function event(ev, nowMs) {
    const tps = 20;
    if (ev.e === 'shot') fx.push({ k: ev.k, x: ev.x, y: ev.y, x2: ev.x2, y2: ev.y2, born: nowMs, life: ev.k === 'round' ? 110 : Math.max(60, (ev.ticks / tps) * 1000) });
    else if (ev.e === 'spit') fx.push({ k: 'spit', x: ev.x + 0.5, y: ev.y + 0.5, x2: ev.x2, y2: ev.y2, born: nowMs, life: 420 });
    else if (ev.e === 'hit') fx.push({ k: 'spark', x: ev.x + 0.5, y: ev.y + 0.5, born: nowMs, life: 260, seed: Math.random() * 6 });
    else if (ev.e === 'enemyDied') fx.push({ k: 'splat', x: ev.x + 0.5, y: ev.y + 0.5, born: nowMs, life: 520, seed: Math.random() * 6, big: ev.type === 'carapace' ? 2.4 : ev.type === 'gnasher' ? 1.5 : 1 });
    if (fx.length > 600) fx.splice(0, fx.length - 600);
  }
  /** Where the enemies are drawn right now: [[x, y, type, hpShare]]. */
  function now(nowMs = performance.now()) {
    const out = [], a = Math.min(1, (nowMs - at) / dt);
    for (let k = 0; k < foes.length; k += 6) { const p = prev.get(foes[k]); out.push([p ? p[0] + (foes[k + 1] - p[0]) * a : foes[k + 1], p ? p[1] + (foes[k + 2] - p[1]) * a : foes[k + 2], foes[k + 3], foes[k + 4], foes[k + 5]]); }
    return out;
  }

  function paint({ nowMs, pushL, pushS, pushG, S, shake, flash }) {
    const li = S.amb[0] + S.sunCol[0] * 0.9 + 0.12;
    const t = nowMs / 1000;
    for (const [x, y, type, hp, state] of now(nowMs)) {
      const b = BODY[type | 0] || BODY[0];
      const wig = Math.sin(t * 24 + x * 3.1 + y * 1.7) * 0.25;
      pushS(x + 0.4, y + 0.6, b.size + 0.6, 0, 0, 0, 0.4);                                  // shadow
      // legs: a flickering dark smudge round the body (they skitter)
      pushS(x + wig, y - wig * 0.6, b.leg, b.col[0] * 0.35 * li, b.col[1] * 0.35 * li, b.col[2] * 0.3 * li, 0.55);
      pushS(x, y, b.size + 0.8, 0.85 * li, 0.82 * li, 0.55 * li, 0.35);                       // a pale fringe of legs and dust
      pushS(x, y, b.size, b.col[0] * li, b.col[1] * li, b.col[2] * li, 1);                  // carapace
      pushS(x + b.size * 0.25, y - b.size * 0.25, Math.max(1, b.size * 0.4), b.eye[0], b.eye[1], b.eye[2], 1); // the eyes
      if (b.sac) pushG(x, y + 0.4, 1.6, 0.6, 0.9, 0.2, 0.8 + 0.4 * Math.sin(t * 6 + x));
      if (hp < 0.999) pushS(x, y - b.size, Math.max(1, b.size * hp), 1.6, 0.2, 0.15, 0.9);  // a red notch: wounded
      // bioluminescent eyes: a faint green glow, so a party in the lamp light reads as a crowd
      pushL(x, y, 4 + b.size * 2, 0.5, 1, 0.3, 0.18 + 0.25 * S.night);
      if (state === 2) pushG(x, y - b.size * 0.4, 1.2, 1, 0.9, 0.5, 0.6);                 // biting: chips flying
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      const age = (nowMs - f.born) / f.life;
      if (age >= 1) { fx.splice(i, 1); if (f.k === 'shell') { /* the blast is the sim's own explosion event */ } continue; }
      if (f.k === 'bolt') {
        const px = f.x + (f.x2 - f.x) * age, py = f.y + (f.y2 - f.y) * age;
        const ux = (f.x2 - f.x), uy = (f.y2 - f.y), l = Math.hypot(ux, uy) || 1;
        for (let k = 0; k < 4; k++) pushS(px - (ux / l) * k * 0.7, py - (uy / l) * k * 0.7, 1, 1.4 - k * 0.25, 1.1 - k * 0.2, 0.7 - k * 0.1, 1 - k * 0.2);
        pushL(px, py, 5, 1, 0.85, 0.55, 0.5);
      } else if (f.k === 'round') {
        // a tracer: a bright dashed line, a muzzle flash
        const n = Math.ceil(Math.hypot(f.x2 - f.x, f.y2 - f.y));
        const fade = 1 - age;
        for (let k = 0; k < n; k += 2) { const q = k / n; if (((k / 2) | 0) % 3 === 0) continue; pushS(f.x + (f.x2 - f.x) * q, f.y + (f.y2 - f.y) * q, 1, 2.2 * fade, 1.8 * fade, 0.9 * fade, fade); }
        if (age < 0.5) { pushL(f.x, f.y, 10, 1, 0.8, 0.4, 1.4 * (1 - age * 2)); pushG(f.x, f.y, 2.4, 1, 0.85, 0.45, 1.2 * (1 - age * 2)); }
        pushG(f.x2, f.y2, 1.6, 1, 0.7, 0.3, 0.9 * fade);
      } else if (f.k === 'shell') {
        // the shell climbs and falls on a fake arc (height is only for drawing; the world is flat)
        const px = f.x + (f.x2 - f.x) * age, py = f.y + (f.y2 - f.y) * age;
        const hgt = Math.sin(age * Math.PI) * Math.min(40, Math.hypot(f.x2 - f.x, f.y2 - f.y) * 0.45);
        pushS(px + 0.5, py + 0.6, 1.4, 0, 0, 0, 0.45);
        pushS(px, py - hgt, 1.6, 0.25, 0.24, 0.22, 1);
        pushG(px, py - hgt + 0.8, 1.4, 1, 0.55, 0.2, 0.7);
        if (age < 0.12) { pushL(f.x, f.y, 16, 1, 0.7, 0.35, 2.2); pushG(f.x, f.y, 4, 1, 0.7, 0.3, 1.6); if (!f.thump) { f.thump = true; shake?.(0.8); } }
      } else if (f.k === 'spit') {
        const px = f.x + (f.x2 - f.x) * age, py = f.y + (f.y2 - f.y) * age - Math.sin(age * Math.PI) * 4;
        pushG(px, py, 1.6, 0.55, 1, 0.2, 1.1 * (1 - age * 0.5));
        pushL(px, py, 5, 0.5, 1, 0.2, 0.5);
        if (age > 0.85) for (let k = 0; k < 5; k++) pushG(f.x2 + Math.cos(k * 1.3) * 1.2, f.y2 + Math.sin(k * 1.3) * 1.2, 1.2, 0.5, 1, 0.2, 0.8);
      } else if (f.k === 'spark') {
        for (let k = 0; k < 6; k++) { const a = f.seed + k * 1.05, d = age * 3; pushS(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 1, 2, 1.6, 0.8, 1 - age); }
        pushL(f.x, f.y, 6, 1, 0.8, 0.5, 0.9 * (1 - age));
      } else if (f.k === 'splat') {
        const n = 10;
        for (let k = 0; k < n; k++) {
          const a = f.seed + (k / n) * 6.283, d = (0.4 + age * 2.6) * f.big * (0.7 + ((k * 0.37) % 0.6));
          pushS(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d - Math.sin(age * Math.PI) * 1.5 * f.big, 1, 0.6 * (1 - age) + 0.2, 0.85 * (1 - age) + 0.2, 0.2, 1 - age * 0.8);
        }
        pushG(f.x, f.y, 3 * f.big, 0.55, 0.95, 0.25, 1.2 * (1 - age) * (1 - age));
        if (f.big > 2 && age < 0.05 && !f.flashed) { f.flashed = true; flash?.(0.04); }
      }
    }
  }
  return { setFoes, event, paint, now, get count() { return foes.length / 6; } };
}
