// Play-test 8 (W21): the damage meter — the playground's meters/ experiment (meters/js/meter.js + meter-ui.js, used as
// it is: nothing in the experiment was changed) in a window of the game. Settings -> Game -> Interface -> "Damage meter",
// OFF by default; `/meter` in chat switches it too.
//
//   bars per fighter  ->  click a bar: that fighter's skills  ->  click a skill: every hit
//   Damage done · Healing · Damage taken · Absorbs · Deaths, for this fight, any earlier fight, or all of them
//
// Who is on it: you, your party members who are near enough for the server to tell you about (the same room), and
// the pets of either. Enemies appear under "Damage taken" as what hurt you, never as bars of their own under "done".
//
// The feed is A's (protocol v8): the client says `meter {on:true}` and the server sends `hits {l:[[src, tgt, n, flags,
// sk, el, over, abs], …], names?}` a few times a second while it is on. Against a server that has no such message the
// window falls back to the `hit` / `miss` events every client already sees (coarser: no overkill, no absorbs).
// A fight starts with the first hit after 8 quiet seconds and is named after the first enemy in it. Rules: pt8-core.js.

import { createPanel, h } from '../ui-panel.js';
import { Meter } from '../../../../../meters/js/meter.js';
import { renderMeter, METER_CSS } from '../../../../../meters/js/meter-ui.js';
import { meterRecord, hitRowFromEvent, createFightClock, meterOurs, HIT_FLAGS } from './pt8-core.js';

/** The experiment's meter, with the game's one rule on top: only OUR side has bars under "done" (and healing / absorbs). */
class PartyMeter extends Meter {
  constructor(o) { super(o); this.ours = new Set(); }
  report(mode = 'damage', scope = 'current', o = {}) {
    const rows = super.report(mode, scope, o);
    const side = mode === 'status' ? () => true : r => this.ours.has(String(r.id));      // (under "taken" and "deaths" the row is the one who was hurt)
    const out = rows.filter(side);
    const top = (out[0]?.total || out[0]?.count) || 1;
    for (const r of out) r.pct = +(100 * (r.total || r.count) / top).toFixed(1);
    out.duration = rows.duration; out.grand = out.reduce((s, r) => s + (r.total || 0), 0);
    return out;
  }
}

export function createMeterWindow({ net, hud, actors, selfId, bar, settings }) {
  if (!document.getElementById('tv-meter-css')) { const st = document.createElement('style'); st.id = 'tv-meter-css'; st.textContent = METER_CSS; document.head.appendChild(st); }
  const meter = new PartyMeter({ maxFights: 30 });
  const clock = createFightClock();
  const S = { on: false, srv: false, dirty: false, last: 0, state: { mode: 'damage', scope: 'current' }, names: new Map(), party: [], records: 0 };
  const body = h('div.tv-meter');
  const foot = h('p.tiny.meter-foot');
  const panel = createPanel({ id: 'meter', title: 'Damage meter', width: 380, cls: 'meter-panel', onOpen: () => { draw(true); }, onClose: () => { if (S.on && !S.closing) hud.toast('The damage meter keeps counting. Open it again with /meter, or switch it off in Settings.', 'info'); } });
  panel.fill(body, foot,
    h('div.row.end', {}, h('button.ghost.small', { type: 'button', dataset: { act: 'reset' }, title: 'Forget every fight so far', onclick: () => reset() }, 'Reset'), h('span.grow'),
      h('button.ghost.small', { type: 'button', dataset: { act: 'off' }, title: 'Stop counting and close. Settings -> Game -> Damage meter brings it back.', onclick: () => settings?.set?.('meter', false) }, 'Switch off')));

  const now = () => performance.now() / 1000;
  const nameOf = id => actors.get(id)?.name || actors.get(+id)?.name || S.names.get(String(id)) || '';
  const skillName = id => (bar?.() || []).find(b => b && b.id === id)?.name || '';
  function ours() {
    const list = [...(actors.actors?.values?.() || [])].map(a => ({ id: a.id, owner: a.owner ?? a.ownerId ?? null, pet: a.pet }));
    const set = meterOurs({ selfId: selfId(), partyIds: S.party, actors: list });
    for (const a of actors.actors?.values?.() || []) if (a.pet && !a.hostile) set.add(String(a.id));      // a pet is somebody's of ours: the server only sends us our own side's
    return set;
  }
  /** One row of the feed (A's `hits` shape) into the meter. */
  function feed(row) {
    const O = ours(), src = row[0] == null ? null : String(row[0]), tgt = String(row[1]);
    if (!(src != null && O.has(src)) && !O.has(tgt)) return false;            // nothing to do with us
    const t = now();
    const foe = src != null && !O.has(src) ? nameOf(src) : !O.has(tgt) ? nameOf(tgt) : '';
    if (clock.feed(t, foe) === 'start') { if (meter.current) meter.endFight(); meter.startFight(clock.label()); }
    else if (meter.current && meter.current.label !== clock.label()) meter.current.label = clock.label();
    const rec = meterRecord(row, { t, nameOf, skillName });
    if (!rec) return false;
    meter.ours = O;
    meter.record(rec);
    if (rec.killingBlow) meter.record({ t, kind: 'death', source: rec.source, sourceName: rec.sourceName, target: rec.target, targetName: rec.targetName, via: rec.via, viaName: rec.viaName });
    S.records++; S.dirty = true;
    return true;
  }
  function reset() { meter.fights = []; meter.current = null; meter.itemStats = {}; S.records = 0; S.state = { mode: S.state.mode, scope: 'current' }; draw(true); }

  function draw(force = false) {
    if (!panel.isOpen) return;
    const t = performance.now();
    if (!force && (!S.dirty || t - S.last < 500)) return;      // twice a second is plenty for a table of numbers
    S.last = t; S.dirty = false;
    meter.ours = ours();
    // a click inside the list re-renders it; keep the scroll where it was
    const top = body.querySelector('.meter-list')?.scrollTop || 0;
    renderMeter(meter, body, S.state);
    const list = body.querySelector('.meter-list'); if (list) list.scrollTop = top;
    if (!meter.fights.length) body.querySelector('.meter-list')?.replaceChildren(h('p.empty', {}, 'Nothing yet. Hit something — the bars fill in as you fight.'));
    panel.setTitle('Damage meter', meter.fights.length ? `${meter.fight()?.label || 'Fight'}${clock.idle(now()) ? ' — over' : ''}` : 'Waiting for a fight');
    const party = S.party.length;
    foot.textContent = party ? 'You, your pets, and party members near you. Click a bar for its skills, a skill for every hit.' : 'You and your pets. In a party, members near you are counted too. Click a bar for its skills.';
  }

  function setOn(on) {
    on = !!on;
    if (S.on === on) { if (on && !panel.isOpen) panel.open(); return; }
    S.on = on;
    const n = net();
    if (typeof n?.meter === 'function') { try { n.meter(on); S.srv = on; } catch { S.srv = false; } }
    else if (n?._raw && n.joined) { try { n._raw('game', JSON.stringify({ t: 'meter', on })); } catch { /* an older server */ } }
    if (on) panel.open(); else { S.closing = true; panel.close(); S.closing = false; }
  }
  settings?.on?.((k, v) => { if (k === 'meter') setOn(v); });

  function wire(n) {
    n.on('hits', m => {
      if (!S.on) return;
      S.srv = true; S.gotHits = true;
      for (const [id, name] of Object.entries(m.names || {})) S.names.set(String(id), name);
      for (const row of m.l || []) feed(row);
    });
    // the older feed: only while the server has never sent `hits`
    n.on('ev', ({ e }) => { if (!S.on || S.gotHits) return; for (const ev of e || []) { const row = hitRowFromEvent(ev); if (row) feed(row); } });
    n.on('partyFrames', list => { S.party = (list || []).filter(r => r.id != null && r.online !== false).map(r => r.id); });
    n.on('joined', () => { S.gotHits = false; if (S.on) { const c = net(); if (typeof c?.meter === 'function') c.meter(true); else c?._raw?.('game', JSON.stringify({ t: 'meter', on: true })); } });
  }
  function tick() { draw(); }
  // the saved setting (default off)
  queueMicrotask(() => { if (settings?.get?.('meter')) setOn(true); });

  return { panel, wire, tick, setOn, feed, reset, meter, HIT_FLAGS,
    toggle() { const on = !S.on; if (settings?.set) settings.set('meter', on); else setOn(on); return on; },
    get state() { const rows = meter.fights.length ? meter.report(S.state.mode, S.state.scope) : []; return { on: S.on, open: panel.isOpen, server: S.srv, records: S.records, fights: meter.fights.length, label: meter.fight()?.label || '', mode: S.state.mode, rows: rows.map(r => ({ id: r.id, name: r.name, total: r.total, dps: r.dps, hits: r.hits })) }; } };
}
