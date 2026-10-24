// TOWER PULL — a tall stack of wooden blocks, three to a layer, and everyone takes turns. On your turn (8 seconds) tap
// a block to grab it, then tap PULL while the sliding marker is in the green: a clean pull barely shakes the tower, a
// clumsy one makes it wobble a lot. The block goes on top. The WOBBLE meter is shared and settles a little before each
// turn; push it past the top and the tower crashes down — whoever pulled loses 4 points and everyone else gets 2. A
// new tower goes up and play carries on. Every clean pull is +1 (+2 for a risky block). Late in the game it's
// SUDDEN WOBBLE: every pull shakes half as much again.
//
// The physics-lite model (one table, so the phone can show the same risk the server uses):
//   * a block from a full layer: the middle is safest (8), an edge is riskier (13);
//   * the second block out of a layer leaves ONE block holding it up: the middle alone is 20, a lonely EDGE block is 34
//     (nearly always a crash, but it is there when nothing else is); the last block of a layer can never be pulled;
//   * low layers carry more weight (+0.5 per layer above), every layer down to its middle block makes the whole tower
//     tippier (+2.5 each), every layer down to one edge block much tippier (+6 each); the top two layers are off limits.
//   The pull meter's green zone is narrower for a riskier block; how far outside the green you tap adds wobble.
//
// TIMING: the phone sends `pick` { lv, s, t } and `pull` { t } with ITS clock times (toss-kit.js phoneTime checks them),
// so the marker the server judges is exactly the one the phone drew.
import { phoneTime, placeOrder, pingPong, r2 } from '../toss-kit.js';

export const meta = {
  id: 'tower-pull', title: 'Tower Pull', blurb: 'Pull a block, stack it on top, and don\'t be the one who topples the tower!',
  how: ['On your turn, tap a block, then tap PULL while the marker is in the green.', 'Middle blocks are safest. A clumsy pull makes the tower wobble.', 'Topple it and you lose 4 points. Everyone else gets 2!'],
  kind: 'ui', min: 1, max: 4, seconds: 82, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-tower-pull', css: true,
  controls: { a: 'Pull' },
};
export const START_LEVELS = 13, TURN_S = 8, COUNT_S = 3, PLAY_S = 72, END_S = 3, FALL_S = 2.6, SUDDEN_AT = 50;
export const TOPPLE = -4, BYSTANDER = 2, LAG_S = 1.0, AHEAD_S = 0.15, MEDALS = [8, 14, 20];
export const LEVELS = {
  easy: { period: 1.5, zone: 1.25, shake: 0.85, settle: 0.2 },
  normal: { period: 1.15, zone: 1, shake: 1, settle: 0.15 },
  hard: { period: 0.9, zone: 0.82, shake: 1.1, settle: 0.12 },
};
const FULL = 7, BIT = s => 1 << s;                    // a layer is a 3-bit mask: bit 0 left, bit 1 middle, bit 2 right
export const count = m => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
/** Can block s of layer lv be pulled from this tower (an array of masks, bottom first)? */
export function canPull(tower, lv, s) {
  const m = tower[lv]; if (m == null || !(m & BIT(s)) || lv >= tower.length - 2) return false;
  return (m & ~BIT(s)) !== 0;                         // never the last block of a layer
}
/** How risky a pull is (bigger = shakier; about 8 to 35). */
export function riskOf(tower, lv, s) {
  const m = tower[lv], after = m & ~BIT(s), base = m === FULL ? (s === 1 ? 8 : 13) : after === 2 ? 20 : 34;
  let tippy = 0; for (let i = 0; i < tower.length - 1; i++) tippy += tower[i] === 2 ? 2.5 : tower[i] === 1 || tower[i] === 4 ? 6 : 0;
  return r2(base + 0.5 * (tower.length - 1 - lv) + tippy);
}
/** Half-width of the green zone on the 0..1 meter. */
export const zoneOf = (risk, L) => Math.max(0.05, Math.min(0.3, (0.32 - risk * 0.0075) * L.zone));
/** Wobble a pull adds: a clean pull (meter inside the green) adds a third of the risk; outside, much more. */
export function shakeOf(risk, meter, L, sudden = false) {
  const err = Math.abs(meter - 0.5), z = zoneOf(risk, L);
  return r2(risk * (0.3 + 6 * Math.max(0, err - z)) * L.shake * (sudden ? 1.5 : 1));
}
/** Every block that may be pulled now: [[lv, s, risk]], safest first. */
export function legal(tower) {
  const out = [];
  for (let lv = 0; lv < tower.length; lv++) for (let s = 0; s < 3; s++) if (canPull(tower, lv, s)) out.push([lv, s, riskOf(tower, lv, s)]);
  return out.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
}
const newTower = () => Array.from({ length: START_LEVELS }, () => FULL);
/** Put a block on top: fill the top layer's left, middle, right, then start a new layer. */
function stack(tower) { const top = tower[tower.length - 1]; if (top === FULL) tower.push(1); else tower[tower.length - 1] = top === 1 ? 3 : FULL; }

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = rng.shuffle(players.map(p => p.pid)), solo = pids.length === 1;
  const S = Object.fromEntries(pids.map(p => [p, { pts: 0, pulls: 0, topples: 0, last: null }]));
  let tower = newTower(), towers = 1, wobble = 0, turn = 0, who = pids[0], turnEl = 0, pick = null;
  let phase = 'count', left = COUNT_S, el = 0, fallT = 0, over = false;
  const events = [];
  const sudden = () => el >= SUDDEN_AT;
  function nextTurn(after = who) {
    who = pids[(pids.indexOf(after) + 1) % pids.length]; turn++; turnEl = el; pick = null;
    wobble = r2(wobble * (1 - L.settle));
    events.push({ e: 'turn', pid: who, k: turn });
  }
  function pull(meter) {
    const [lv, s] = pick, risk = riskOf(tower, lv, s), add = shakeOf(risk, meter, L, sudden()), st = S[who];
    st.last = Math.max(st.last ?? 0, pick[2]);
    wobble = r2(wobble + add);
    tower[lv] &= ~BIT(s);
    if (wobble >= 100) {
      st.pts = Math.max(0, st.pts + TOPPLE); st.topples++;
      for (const p of pids) if (p !== who) S[p].pts += BYSTANDER;
      events.push({ e: 'topple', pid: who, lv, s, meter: r2(meter), add });
      phase = 'fall'; fallT = FALL_S; pick = null; return;
    }
    const pts = risk >= 18 ? 2 : 1; st.pts += pts; st.pulls++;
    stack(tower);
    events.push({ e: 'pull', pid: who, lv, s, meter: r2(meter), add, w: wobble, pts, clean: Math.abs(meter - 0.5) <= zoneOf(risk, L) });
    nextTurn();
  }
  return {
    events,
    init: () => ({ order: pids, turnS: TURN_S, play: PLAY_S, count: COUNT_S, level: L, solo, medals: MEDALS, sudden: SUDDEN_AT, topple: TOPPLE, bystander: BYSTANDER }),
    act(pid, a, d) {
      if (phase !== 'turn' || over || pid !== who || !d || typeof d !== 'object') return;
      if (a === 'pick') {
        const lv = d.lv | 0, s = d.s | 0; if (!canPull(tower, lv, s)) return;
        const t = phoneTime(d, el, S[pid].last, { ahead: AHEAD_S, lag: LAG_S, max: PLAY_S + TURN_S + 2 }); if (t == null) return;
        pick = [lv, s, t]; events.push({ e: 'pick', pid, lv, s });
      } else if (a === 'pull' && pick) {
        const t = phoneTime(d, el, pick[2], { ahead: AHEAD_S, lag: LAG_S, max: PLAY_S + TURN_S + 2 }); if (t == null) return;
        pull(pingPong(t - pick[2], L.period));
      }
    },
    step(dt) {
      if (over) return;
      if (phase === 'count') { left -= dt; if (left <= 0) { phase = 'turn'; el = 0; turnEl = 0; events.push({ e: 'turn', pid: who, k: 0 }); } return; }
      if (phase === 'end') { left -= dt; if (left <= 0) over = true; return; }
      el += dt;
      if (phase === 'fall') {
        fallT -= dt;
        if (fallT <= 0) {
          if (el >= PLAY_S) { phase = 'end'; left = END_S; events.push({ e: 'end' }); return; }
          tower = newTower(); towers++; wobble = 0; phase = 'turn'; events.push({ e: 'new', k: towers }); nextTurn();
        }
        return;
      }
      if (el - turnEl >= TURN_S) {                      // out of time: a fumbled pull (a block is grabbed for you)
        if (!pick) { const opts = legal(tower); const o = opts[Math.min(opts.length - 1, Math.floor(rng() * Math.min(4, opts.length)))]; pick = [o[0], o[1], el]; events.push({ e: 'pick', pid: who, lv: o[0], s: o[1], auto: true }); }
        events.push({ e: 'slow', pid: who }); pull(0);
        return;
      }
      if (el >= PLAY_S && (!pick || el >= PLAY_S + 3)) { phase = 'end'; left = END_S; events.push({ e: 'end' }); }
    },
    state() {
      const sc = {}; for (const p of pids) sc[p] = S[p].pts;
      return {
        phase, left: phase === 'count' ? Math.max(0, Math.ceil(left)) : phase === 'end' ? 0 : Math.max(0, Math.ceil(PLAY_S - el)), el: Math.floor(el * 2) / 2,
        sc, tw: tower.join(''), w: Math.round(Math.min(100, wobble)), who, k: turn, tl: phase === 'turn' ? Math.max(0, Math.ceil(TURN_S - (el - turnEl))) : 0,
        pk: pick ? [pick[0], pick[1], r2(pick[2])] : null, sd: sudden() ? 1 : 0, n: towers,
      };
    },
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, S[p].pts]));
      return { order: placeOrder(pids, p => S[p].pts), scores, unit: meta.unit, ...(solo ? { medal: MEDALS.filter(m => S[pids[0]].pts >= m).length } : {}) };
    },
    get _el() { return el; }, get _phase() { return phase; }, get _tower() { return tower; }, get _who() { return who; }, get _pick() { return pick; }, get _wobble() { return wobble; }, get _turnEl() { return turnEl; },
    _stats: S, _level: L,
  };
}
