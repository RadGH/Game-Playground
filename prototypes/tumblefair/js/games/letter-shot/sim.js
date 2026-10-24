// LETTER SHOT — call your shot, one hoop, everyone watching. The SETTER taps one of seven chalk marks round the hoop
// (close, the wings, the corners, the top, way back) and shoots it with the same HOLD-and-let-go meter as Hoop
// Frenzy. Sink it and EVERYONE ELSE shoots that same mark at the same time (no waiting in a queue): whoever misses
// earns the next letter of F-A-I-R. Miss as the setter and nothing happens — the next player sets. The setter moves
// round the table after every turn. Spell FAIR and you are out; the last one in wins. A far mark is harder for
// everybody (its green band is narrower), so a confident setter picks a hard one. Timers keep it moving: 5 s to pick
// (or a mark is picked for you), 6 s to shoot (or the ball is thrown for you, badly). In the second half a missed
// copy costs two letters, so a game nearly always ends with one player left. Solo: you against Rimsby, a CPU
// shooter who gets better with the lobby difficulty. Halloween spells B-O-O-! instead (looks only).
import { flyShot, release, qualityOf, idealPower, tolFor, HOOP_R } from '../hoops-kit.js';

export const meta = {
  id: 'letter-shot', title: 'Letter Shot', blurb: 'Call your shot — if it drops, everyone must copy it or take a letter!',
  how: ['The setter taps a mark, then HOLDS and lets go in the green.', 'If it goes in, everyone else shoots that mark. Miss = a letter of FAIR.', 'Spell FAIR and you are out. Last one in wins!', 'Second half: a missed copy costs TWO letters.'],
  kind: 'ui', min: 1, max: 4, seconds: 90, scoring: 'survival', unit: 'letters', tags: ['action'], card: 'card-letter-shot', css: true,
};

export const WORD = 'FAIR', OUT_AT = WORD.length;
export const RIM_Y = 3.05, REL_Y = 1.95, HOOP_Z = -4;
export const HOOP = { x: 0, y: RIM_Y, z: HOOP_Z, r: HOOP_R, nx: 0, nz: 1 };
/** The chalk marks: distance from the rim (m) and angle from straight out (degrees, + = to the right). */
export const SPOTS = [
  { id: 'close', name: 'Close', d: 2.6, a: 0 }, { id: 'lwing', name: 'Left wing', d: 3.9, a: -45 }, { id: 'rwing', name: 'Right wing', d: 3.9, a: 45 },
  { id: 'lcorner', name: 'Left corner', d: 5.2, a: -78 }, { id: 'rcorner', name: 'Right corner', d: 5.2, a: 78 }, { id: 'top', name: 'Top', d: 5.6, a: 0 },
  { id: 'deep', name: 'Way back', d: 7, a: 22 },
].map(s => ({ ...s, x: Math.round(Math.sin(s.a * Math.PI / 180) * s.d * 100) / 100, z: Math.round((HOOP_Z + Math.cos(s.a * Math.PI / 180) * s.d) * 100) / 100 }));
export const DOUBLE_S = 45;                                        // the hurry-up: a missed copy costs two letters
export const TIMES = { start: 1.5, pick: 5, shoot: 6, after: 0.9, end: 1.5, cpuPick: 1.1, cpuShoot: 1.3 };
/** Meter period, band half width, the CPU's aim (its error in band widths) by lobby difficulty. */
export const LEVELS = {
  easy:   { period: 1.8, tol: 0.08, cpu: 1.7 },
  normal: { period: 1.5, tol: 0.06, cpu: 1.2 },
  hard:   { period: 1.25, tol: 0.048, cpu: 0.8 },
};
export const CPU_NAME = 'Rimsby';
const r2 = v => Math.round(v * 100) / 100;
export const PH = { START: 0, PICK: 1, SET: 2, SETFLY: 3, COPY: 4, COPYFLY: 5, END: 6 };
export const validShot = d => d && typeof d === 'object' && Number.isFinite(d.p) && d.p >= 0 && d.p <= 1;

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, events = [];
  // everyone who shoots: the players in seat order, plus Rimsby when you play alone
  const E = players.map(p => ({ pid: p.pid, name: p.name, letters: 0, out: false, outAt: 0, shot: 0, timer: 0, makes: 0 }));
  if (E.length === 1) E.push({ pid: null, name: CPU_NAME, letters: 0, out: false, outAt: 0, shot: 0, timer: 0, makes: 0, cpu: true });
  const byPid = new Map(E.map((e, i) => [e.pid, i]));
  let time = 0, ph = PH.START, tl = TIMES.start, setter = 0, spot = -1, over = false, outs = 0, flyLeft = 0;
  const alive = () => E.map((e, i) => i).filter(i => !E[i].out);
  const nextAlive = i => { for (let k = 1; k <= E.length; k++) { const j = (i + k) % E.length; if (!E[j].out) return j; } return i; };
  const lastTurnAt = meta.seconds - 16;                             // a turn takes ~8 s when people play (if every timer runs out, the bell ends it)
  const double = () => time >= meta.seconds - DOUBLE_S;                             // a new turn needs ~20 s at worst (both timers run out)
  function shoot(i, p, auto = false) {
    const e = E[i], S = SPOTS[spot], q = qualityOf(p, S.d, L.tol);
    const f = flyShot(release(S.x, REL_Y, S.z, HOOP.x, HOOP.z, RIM_Y, q), HOOP);
    e.shot = f.made ? 2 : 3; if (f.made) e.makes++;
    flyLeft = Math.max(flyLeft, f.T + TIMES.after);
    events.push({ e: 'shot', who: i, path: f.path, T: f.T, made: f.made ? 1 : 0, auto: auto ? 1 : 0, q: r2(q) });
  }
  function startPick() {
    if (alive().length <= 1 || (E.length === 2 && E.some(e => e.out)) || time >= lastTurnAt) return finish();
    ph = PH.PICK; tl = E[setter].cpu ? TIMES.cpuPick : TIMES.pick; spot = -1; for (const e of E) e.shot = 0;
    events.push({ e: 'turn', who: setter });
  }
  function pick(i) {
    spot = i; ph = PH.SET; tl = E[setter].cpu ? TIMES.cpuShoot : TIMES.shoot;
    events.push({ e: 'pick', who: setter, spot: i });
  }
  function finish() { if (ph === PH.END) return; ph = PH.END; tl = TIMES.end; events.push({ e: 'end', who: alive().length === 1 ? alive()[0] : -1 }); }
  const cpuPower = () => Math.max(0, Math.min(1, idealPower(SPOTS[spot].d) + (rng() * 2 - 1) * L.cpu * tolFor(SPOTS[spot].d, L.tol)));
  const cpuPick = () => { const easy = difficulty === 'easy'; const pool = SPOTS.map((s, i) => i).filter(i => (easy ? SPOTS[i].d < 5 : SPOTS[i].d > 3)); return rng.pick(pool); };
  return {
    events,
    init: () => ({ who: E.map(e => ({ pid: e.pid, name: e.name, cpu: !!e.cpu })), spots: SPOTS, hoop: HOOP, relY: REL_Y, word: WORD, level: L, times: TIMES }),
    act(pid, a, d) {
      const i = byPid.get(pid); if (i == null || over) return; const e = E[i]; if (e.out) return;
      if (a === 'pick' && ph === PH.PICK && i === setter && Number.isInteger(d) && d >= 0 && d < SPOTS.length) pick(d);
      else if (a === 'shoot' && validShot(d)) {
        if (ph === PH.SET && i === setter) { shoot(i, d.p); ph = PH.SETFLY; }
        else if (ph === PH.COPY && i !== setter && e.shot === 0) shoot(i, d.p);
      }
    },
    step(dt) {
      if (over) return;
      time += dt;
      if (ph === PH.END) { tl -= dt; if (tl <= 0) over = true; return; }
      if (time >= meta.seconds - 1) return finish();
      if (ph === PH.SETFLY || ph === PH.COPYFLY) flyLeft -= dt; else tl -= dt;
      if (ph === PH.START && tl <= 0) startPick();
      else if (ph === PH.PICK && tl <= 0) pick(E[setter].cpu ? cpuPick() : rng.int(0, SPOTS.length - 1));
      else if (ph === PH.SET && tl <= 0) { shoot(setter, E[setter].cpu ? cpuPower() : rng(), !E[setter].cpu); ph = PH.SETFLY; }
      else if (ph === PH.SETFLY && flyLeft <= 0) {
        if (E[setter].shot === 2) {
          ph = PH.COPY; tl = TIMES.shoot;
          for (const i of alive()) if (i !== setter) { E[i].shot = 0; E[i].timer = E[i].cpu ? TIMES.cpuShoot + rng() * 0.6 : TIMES.shoot; }
          events.push({ e: 'copy', who: setter, spot, x2: double() ? 1 : 0 });
        } else { events.push({ e: 'nobody', who: setter }); setter = nextAlive(setter); startPick(); }
      } else if (ph === PH.COPY) {
        for (const i of alive()) if (i !== setter && E[i].shot === 0) { E[i].timer -= dt; if (E[i].timer <= 0) shoot(i, E[i].cpu ? cpuPower() : rng(), !E[i].cpu); }
        if (alive().every(i => i === setter || E[i].shot)) ph = PH.COPYFLY;
      } else if (ph === PH.COPYFLY && flyLeft <= 0) {
        const at = ++outs;                                           // everyone who goes out on the same shot goes out together
        for (const i of alive()) if (i !== setter && E[i].shot === 3) {
          const e = E[i]; e.letters = Math.min(OUT_AT, e.letters + (double() ? 2 : 1));
          if (e.letters >= OUT_AT) { e.out = true; e.outAt = at; }
          events.push({ e: 'letter', who: i, n: e.letters, out: e.out ? 1 : 0 });
        }
        setter = nextAlive(setter); startPick();
      }
    },
    state() {
      const sc = {}; for (const e of E) if (e.pid != null) sc[e.pid] = e.letters;
      const timer = ph === PH.COPY ? null : Math.max(0, Math.ceil(tl));
      return { ph, s: setter, sp: spot, r: E.map(e => [e.letters, e.out ? 1 : 0, e.shot, ph === PH.COPY && !e.shot ? Math.max(0, Math.ceil(e.timer)) : 0]), tl: timer, x2: double() ? 1 : 0, sc, left: Math.max(0, Math.ceil(meta.seconds - time)) };
    },
    get over() { return over; },
    result() {
      // still in: fewest letters first (ties share); then the ones who went out, the last to go out first
      const humans = E.filter(e => e.pid != null), rows = [];
      for (const e of humans) rows.push({ pid: e.pid, key: e.out ? -100 + e.outAt : 100 - e.letters });
      const g = new Map(); for (const r of rows) { if (!g.has(r.key)) g.set(r.key, []); g.get(r.key).push(r.pid); }
      const order = [...g.keys()].sort((a, b) => b - a).map(k => g.get(k));
      return { order, scores: Object.fromEntries(humans.map(e => [e.pid, e.letters])), unit: meta.unit, cpu: E.find(e => e.cpu) ? { letters: E.find(e => e.cpu).letters, out: E.find(e => e.cpu).out } : null, makes: Object.fromEntries(humans.map(e => [e.pid, e.makes])) };
    },
    _debug: { E, get ph() { return ph; }, get setter() { return setter; }, get spot() { return spot; }, L },
  };
}
