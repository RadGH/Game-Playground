// Practice in the intro (Expansion 1 M3, "Learn by doing"). While the intro card is up, a player's controls already
// work: this phone runs its OWN copy of the minigame — the game's own rules (js/games/<id>/sim.js, which is pure and
// already loads in the browser for the view) and its own view, through the same createPlay() a real game uses — with
// only this player in it (plus the game's own computer rival, if it has one). Nothing is sent to the server, so nothing
// here can touch a score, a ticket or another phone. The practice copy starts again by itself when it ends.
//
//   const p = await createPractice({ stage, controls, intro, members, me, uiRoot, sfx, onUse, onFail })
//   p.stop()            free everything (the real game is then built by main.js)
//   p.rounds            how many practice copies have been played (1 = the first)
//
// `onUse(kind)` is called the first time the player moves ('move'), presses a button ('a' / 'b') or taps the game's
// screen ('tap'), so the card can step aside and the hints can go. `onFail(err)` = the copy could not run (the game's
// rules threw): main.js falls back to the lighter version (the controls panel is live, nothing moves).
import { createPlay } from './play.js';
import { practiceInstance, PRACTICE_DIFFICULTY } from '../shared/practice-rules.js';
import { packBody, DT } from '../shared/arena.js';
import { IN } from '../shared/protocol.js';
import { GAMES } from '../games/metas.js';

export async function createPractice({ stage, controls, intro, members, me, uiRoot, sfx = () => {}, onUse = () => {}, onFail = () => {} }) {
  const meta = GAMES[intro.game]?.meta;
  if (!meta) throw new Error('no such game ' + intro.game);
  const mod = await import(`../games/${intro.game}/sim.js`);
  const self = intro.players.find(p => p.pid === me) || { pid: me, seat: 0, name: 'You' };
  const arena = meta.kind === 'arena';
  let inst = null, play = null, timer = null, stopped = false, tick = 0, t = 0, lastState = '', lastPriv = '', queue = [], ack = 0, starve = 0, building = false;
  const used = new Set();
  const use = k => { if (!used.has(k)) { used.add(k); try { onUse(k); } catch (e) { console.error(e); } } };
  // the controls the practice play reads: the real ones, watched for the first move / press
  const watched = {
    set: s => { if (!stopped) controls.set(s); }, get shown() { return controls.shown; },
    read() { const r = controls.read(); if (r.mx || r.mz) use('move'); if (r.b & IN.A) use('a'); if (r.b & IN.B) use('b'); return r; },
  };
  const clone = d => (d != null && typeof d === 'object' ? JSON.parse(JSON.stringify(d)) : d);
  // the play's line to "the server" goes straight into the local copy
  const localNet = {
    send(m) {
      if (stopped || !inst) return;
      if (m.t === 'in') { queue.push(m); if (queue.length > 12) queue.shift(); }
      else if (m.t === 'act' && typeof m.a === 'string') { use('tap'); try { inst.act?.(me, m.a, clone(m.d)); } catch (e) { fail(e); } }
    },
  };
  const bodies = () => { if (!inst.bodies) return null; const b = {}; for (const [pid, body] of inst.bodies) b[pid] = packBody(body, pid === me ? ack : 0); return b; };
  function fail(e) { if (stopped) return; console.error('practice', intro.game, e); stop(); try { onFail(e); } catch (e2) { console.error(e2); } }

  let round = 0;
  async function build() {
    building = true;
    round++;
    const seed = (Math.floor(Math.random() * 2 ** 31) ^ round) >>> 0;
    inst = practiceInstance(mod, { me, seat: self.seat, name: self.name, season: intro.season || null, seed });
    tick = 0; t = 0; lastState = ''; lastPriv = ''; queue = []; ack = 0; starve = 0;
    const local = { ...intro, players: [{ pid: me, seat: self.seat, name: self.name }], init: inst.init(), b: bodies(), difficulty: PRACTICE_DIFFICULTY };
    const p = await createPlay({ stage, net: localNet, controls: watched, intro: local, members, me, uiRoot, sfx });
    if (stopped) { p.dispose(); return; }
    play = p;
    p.start();
    if (inst.priv) { const d = inst.priv(me); lastPriv = JSON.stringify(d); p.priv(d); }
    building = false;
  }
  function step() {
    if (stopped || building || !inst || !play) return;
    try {
      if (arena) {
        let n = 0; const cap = queue.length > 3 ? 3 : 2;
        while (queue.length && n < cap) { const i = queue.shift(); inst.input(me, i); ack = i.s; n++; }
        if (n) starve = 0; else if (++starve >= 8) inst.input(me, null);
      }
      inst.step(DT); tick++; t += DT;
      if (inst.events?.length) { for (const ev of inst.events) if (ev.to == null || ev.to === me) play.event({ t: 'ge', ...ev, to: undefined }); inst.events.length = 0; }
      const g = inst.state();
      if (arena) play.snap({ t: 's', k: tick, b: bodies(), g });
      else { const s = JSON.stringify(g); if (s !== lastState) { lastState = s; play.snap({ t: 's', k: tick, g }); } }
      if (inst.priv) { const s = JSON.stringify(inst.priv(me)); if (s !== lastPriv) { lastPriv = s; play.priv(JSON.parse(s)); } }
      if (inst.over || t >= meta.seconds + 1) again();
    } catch (e) { fail(e); }
  }
  // the practice copy finished (or its clock ran out): a fresh one, so practice never stops on a results screen
  function again() {
    const old = play; play = null; inst = null; old?.dispose();
    build().catch(fail);
  }
  /** `quiet`: leave the controls alone (the real game may already own them — a copy that finished loading too late). */
  function stop({ quiet = false } = {}) {
    if (stopped) return; stopped = true;
    clearInterval(timer); timer = null;
    const p = play; play = null; inst = null; p?.dispose();      // its controls.set(null) is swallowed by `watched` now
    if (!quiet) controls.set(null);
  }
  await build();
  if (!stopped) timer = setInterval(step, 50);
  return { stop, frame: dt => { try { play?.frame(dt); } catch (e) { fail(e); } }, get rounds() { return round; }, get play() { return play; }, get used() { return used; }, get live() { return !stopped; }, meta };
}
