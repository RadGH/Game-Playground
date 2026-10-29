// Alarm panel: jewel lamps RAID, FIRE, CONVOY, HQ, BASE + the klaxon (sounds while RAID or HQ blinks) with a guarded
// MUTE toggle at the end of the strip (hold it for a lamp test that lights every lamp). Pressing a lit lamp swings the scope to whatever lit
// it. Events light the lamps (§3.4: fire → FIRE, raidForming → RAID blink, convoyHit → CONVOY, baseAlarm → BASE…);
// M4 extends this file with the raid lamps' full behaviour.
import { machinePanel } from './panel.js';
import { createLamp } from '../lamp.js';

export function mountAlarms(C) {
  const { el, body } = machinePanel({ id: 'alarms', title: 'ALARMS', cls: 'machine-strip' });
  const row = document.createElement('div'); row.className = 'lamp-row';
  const lamps = new Map();
  for (const L of C.data.lamps) {
    const lamp = createLamp({ ...L, onPress: (id, st, where) => {
      C.room.play('press');
      if (where) C.scope.centreOn(where.x, where.y);
      else C.print({ who: 'Signals', text: st === 'off' ? `${L.label} LAMP IS DARK. NOTHING TO REPORT.` : `${L.label} LAMP LIT.` });
    } });
    lamps.set(L.id, lamp); row.append(lamp.el);
  }
  // MUTE sits at the end of the lamp strip (owner: one slim top row). Hold it (or right-click it) for a LAMP TEST.
  const mute = document.createElement('button');
  mute.type = 'button'; mute.className = 'mute mute-strip'; mute.setAttribute('aria-pressed', 'false'); mute.setAttribute('aria-label', 'Klaxon mute (hold for a lamp test)');
  mute.title = 'Klaxon mute — hold for a lamp test';
  mute.innerHTML = '<span class="mute-guard"></span><span class="mute-label">MUTE</span>';
  row.append(mute);
  body.append(row);
  let muted = false, testing = false, holdT = 0, held = false;
  function klaxonCheck() {
    const loud = !muted && [...lamps.values()].some(l => (l.id === 'raid' || l.id === 'hq') && l.state === 'blink');
    C.room.klaxon(loud);
    el.classList.toggle('klaxon', loud);
  }
  function lampTest(ms = 900) {
    testing = true; el.classList.add('testing'); C.room.play('press');
    setTimeout(() => { testing = false; el.classList.remove('testing'); }, ms);
  }
  mute.addEventListener('pointerdown', () => { held = false; clearTimeout(holdT); holdT = setTimeout(() => { held = true; lampTest(); }, 550); });
  const cancelHold = () => clearTimeout(holdT);
  mute.addEventListener('pointerup', cancelHold); mute.addEventListener('pointerleave', cancelHold); mute.addEventListener('pointercancel', cancelHold);
  mute.addEventListener('contextmenu', e => { e.preventDefault(); held = true; lampTest(); });
  mute.addEventListener('click', () => {
    if (held) { held = false; return; }
    muted = !muted; mute.setAttribute('aria-pressed', String(muted)); mute.classList.toggle('on', muted); C.room.play('slap'); klaxonCheck();
  });
  return {
    el, lamps, mute, lampTest, get muted() { return muted; }, get testing() { return testing; },
    set(id, st, at) { const l = lamps.get(id); if (!l || l.state === st) return; l.set(st, at); if (st !== 'off') C.room.play('lamp'); klaxonCheck(); },
    states: () => Object.fromEntries([...lamps].map(([k, l]) => [k, l.state])),
  };
}
