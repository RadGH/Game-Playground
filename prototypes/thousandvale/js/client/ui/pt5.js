// The play-test-5 interface in one place (stream D-UI), so main.js only creates it, wires it and ticks it:
//   T5  the starting-equipment step (ui/kit-step.js)            T9/T20 crate + gift reveal (ui/reveal.js), mail attachments
//   T11/T12 the event tracker (ui/event-tracker.js)             T18 the Character menu beside the bag (ui/char-sheet.js)
//   T19 Feedback + T21 the admin's Reports (ui/feedback.js)     T25 angling: bite, tug, cooking (ui/angling.js), the Catch tab
//   T3  who a heal will land on (the note over the action bar)  T4 the "X offers to raise you" prompt   T7 lives in bag.js
//
//   const ui5 = createUi5({ ...main's pieces });  ui5.wire(net);  ui5.tick(dt)
// window.tvui5 = test hooks (state of every piece, fake server messages through the real handlers).

import { h } from '../ui-panel.js';
import { createReveal } from './reveal.js';
import { setCardContext } from './item-card.js';
import { createEventTracker } from './event-tracker.js';
import { createCharSheet } from './char-sheet.js';
import { createFeedback, LOG, installLogRing } from './feedback.js';
import { createKitStep } from './kit-step.js';
import { createAngling } from './angling.js';
import { isCrate, isGift, mmss } from './pt5-core.js';
import { sightMarkers, SIGHT_M, liftChoices } from './pt6-core.js';

installLogRing();          // as early as the interface loads: a bug report wants the lines from before it was opened

export function createUi5(o) {
  const { net, hud, bag, mail, worldUi, journal, actors, me, self, room, hotbar, askPop } = o;

  setCardContext({ vitals: () => { const s = self?.(); return s && s.hpMax ? { hpMax: s.hpMax, mpMax: s.mpMax || 0 } : null; } });      // U17: a potion's card speaks in YOUR numbers
  // ---- T9 / T20: crates and gifts ----
  const reveal = createReveal({ net, hud, bag });
  // ---- T25: angling ----
  const angling = createAngling({ net, hud, bag, reveal });
  // a bag click: open a crate / gift, cast with a rod, else drink or eat (the hotbar's rule), else wear
  bag.setUseHook?.(it => reveal.open(it) || angling.useItem(it) || !!hotbar?.useItem(it));
  if (mail) mail.onTaken = items => {
    // T20: a gift taken from a letter is unwrapped at once (it is in the bag by the time the answer arrives)
    const g = (items || []).find(isGift) || null;
    if (g) setTimeout(() => { const inBag = (bag.state.bag || []).find(i => String(i.uid) === String(g.uid)) || (bag.state.bag || []).find(isGift); if (inBag) reveal.open(inBag); }, 250);
    else if ((items || []).some(isCrate)) hud.toast('The crate is in your bag — click it to open it.', 'info');
  };
  journal?.setCatch?.({ data: () => angling.data, angling: () => net()?.joined?.you?.angling || null });

  // ---- T11 / T12: the event tracker takes over the old "event happening" panel ----
  const tracker = createEventTracker({ hud, me, net });
  if (worldUi) worldUi.tracker = tracker;

  // ---- T18: the Character menu ----
  const sheet = createCharSheet({ net, hud, bag, self, bar: o.bar });
  document.getElementById('inv-stats')?.addEventListener('click', () => { sheet.panel.toggle(); });

  // ---- T19 / T21: feedback ----
  const feedback = createFeedback({ net, hud, context: () => {
    const n = net(), y = n?.joined?.you || {}, p = me() || {}, r = room?.() || {}, st = o.stats?.() || {};
    return { char: y.char ?? null, name: y.name, cls: y.cls, level: self?.().level || y.level, province: r.province || null, zone: o.zoneName?.() || r.name || null, room: r.id || r.kind || null,
      x: p.x, z: p.z, build: o.build || 'dev', quality: o.quality, fps: st.fps, rtt: n?.clock?.rtt, screen: `${innerWidth}x${innerHeight}`, ua: navigator.userAgent };
  } });
  // the game's own warning / system lines are part of "recent log lines"
  const toast0 = hud.toast;
  hud.toast = (text, tone = 'info') => { if (tone === 'warn' || tone === 'bad') LOG.push('game', text); return toast0.call(hud, text, tone); };

  // ---- T5: the starting-equipment step (title screen) ----
  const kits = createKitStep({ parent: document.body, onPreview: g => o.onKitPreview?.(g), onBack: () => o.onKitBack?.(), onCreate: c => o.onKitCreate?.(c),
    askServer: async cls => { const n = await o.ensureNet?.(); return n ? askKits(n, cls) : null; } });

  // ---- T3: say who a friendly skill will land on ----
  const allyNote = h('div.ally-note', { hidden: true, 'aria-live': 'polite' });
  document.getElementById('actionbar')?.before(allyNote);
  let allyKey = '';
  function drawAlly() {
    const t = o.targetId?.() != null ? actors.get(o.targetId()) : null;
    const friendly = t && !t.hostile && (t.kind === 'player' || t.pet);
    const has = (o.bar?.() || []).some(b => b && b.ally && !b.locked && !b.empty);
    const key = friendly && has ? `${t.id}|${t.name}|${t.dead ? 1 : 0}` : '';
    document.getElementById('target-frame')?.classList.toggle('friendly', !!friendly);
    if (key === allyKey) return;
    allyKey = key;
    allyNote.hidden = !key;
    if (key) allyNote.replaceChildren(h('span', {}, t.dead ? 'Fallen ally targeted: ' : 'Your heals and wards go to '), h('b', {}, t.name), h('small', {}, ' · Esc for yourself'));
  }
  document.getElementById('self-frame')?.addEventListener('click', () => { if (o.targetId?.() != null) { o.setTarget?.(null); hud.toast('Target cleared — your heals go to you.', 'info'); } });

  // ---- play-test 6 U16/U18: a shape-shifted player's frame says the shape ("Moonpelt Shape · Druid") ----
  const selfForm = h('em.uf-form', { hidden: true });
  document.getElementById('self-name')?.after(selfForm);
  function drawForms() {
    const sid = o.selfId?.(), f = sid != null ? o.infoOf?.(sid)?.form : null;
    const name = f && (f.name || f.id) ? String(f.name || f.id) : '';
    if (selfForm.textContent !== name) { selfForm.textContent = name; selfForm.hidden = !name; }
    const tid = o.targetId?.(), t = tid != null ? actors.get(tid) : null;
    if (t && t.kind === 'player') { const tf = o.infoOf?.(tid)?.form; t.formName = tf ? tf.name || tf.id || '' : ''; }
  }

  // ---- play-test 6 U14: what is in your line of sight goes on the minimap (enemies, people, doors, chests — dungeons too) ----
  const known = new Set(); let knownRoom = null, sightAt = 0, sightList = [];
  if (o.atlas) {
    const prev = o.atlas.extraMarkers;
    o.atlas.sightOwnsMonsters = true;
    o.atlas.extraMarkers = () => {
      const base = prev ? prev() || [] : [];
      const p = me(); if (!p || !o.los) return base;
      const now = performance.now();
      if (now - sightAt > 250) {             // the minimap asks 12 times a second: look four times a second
        sightAt = now;
        const rid = room?.()?.id; if (rid !== knownRoom) { knownRoom = rid; known.clear(); }
        const dun = !!o.inDungeon?.();
        const skip = new Set();
        for (const m of base) { const k = String(m.id); if (k.startsWith('rare:') || k.startsWith('loot:')) skip.add(isNaN(+k.slice(5)) ? k.slice(5) : +k.slice(5)); }
        const bodies = []; for (const a of actors.actors.values()) { if (a.id === 'preview' || String(a.id).startsWith('crowd-')) continue; bodies.push({ id: a.id, kind: a.kind, hostile: a.hostile, dead: a.dead, pet: a.pet, rank: a.rank, name: a.name, level: a.level, title: a.npcTitle, x: a.pos.x, z: a.pos.z }); }
        // dungeon stairs, exits, chests, gates and levers are already on the dungeon map (atlas.js, by explored ground); the rest is added here
        const have = dun ? new Set(['stairs', 'exit', 'chest', 'portal', 'gate', 'lever']) : new Set();
        const things = []; for (const t of o.objects?.items?.values?.() || []) { if (t.type === 'npc' || have.has(t.type) || t.hidden) continue; things.push({ id: t.id, type: t.type, name: t.name, x: t.x, z: t.z, opened: t.opened, portal: o.infoOf?.(t.id)?.portal }); }
        sightList = sightMarkers({ me: p, bodies, things, los: o.los, range: dun ? SIGHT_M.dungeon : SIGHT_M.outdoor, skip, known });
      }
      return base.concat(sightList);
    };
  }

  // ---- play-test 6 U12: the stair up asks which floor (a lift) ----
  const liftBox = h('div.tv-lift', { hidden: true, role: 'dialog', 'aria-label': 'Which floor?' });
  document.getElementById('hud')?.appendChild(liftBox);
  function liftAsk(m) {
    const list = liftChoices(m);
    if (!list.length) return;
    const go = c => { liftBox.hidden = true; const n = net(); if (typeof n?.use === 'function') n.use(m.id, c.to); else n?._raw?.('game', JSON.stringify({ t: 'use', id: m.id, to: c.to })); };
    liftBox.replaceChildren(h('strong', {}, m.name || 'Stairs up'), h('p', {}, `You are on floor ${m.here ?? '?'}. Where to?`),
      ...list.map(c => h('button.' + (c.top ? 'primary' : 'ghost'), { type: 'button', dataset: { to: c.to }, onclick: () => go(c) }, c.label)),
      h('button.ghost.small', { type: 'button', dataset: { act: 'stay' }, onclick: () => { liftBox.hidden = true; } }, 'Stay here'));
    liftBox.hidden = false;
    liftBox.querySelector('button')?.focus({ preventScroll: true });
  }
  liftBox.addEventListener('keydown', e => { if (e.key === 'Escape') { liftBox.hidden = true; e.stopPropagation(); } });

  // ---- T4: someone offers to raise you ----
  const riseBox = h('div.revive-ask', { hidden: true, role: 'alertdialog', 'aria-label': 'An offer to raise you' });
  document.getElementById('death')?.prepend(riseBox);
  const R = { ask: null };
  const sendRevive = (op, id) => { const n = net(); if (typeof n?.revive === 'function') n.revive(op, id); else n?._raw?.('game', JSON.stringify({ t: 'revive', op, id })); };
  function reviveAsk(m) {
    R.ask = { ...m, until: m.until || Date.now() + (m.ms || 60000) };
    const pct = Number.isFinite(m.hpPct) ? Math.round((m.hpPct <= 1 ? m.hpPct * 100 : m.hpPct)) : null;
    const left = h('b.rv-left');
    riseBox.replaceChildren(
      h('strong', {}, `${m.from || m.name || 'Someone'} offers to raise you`),
      h('p', {}, [m.skill || m.skillName ? `With ${m.skill || m.skillName}` : '', pct != null ? `you stand up right here at ${pct}% health` : 'you stand up right here'].filter(Boolean).join(': ') + '.', m.note ? ` ${m.note}` : ''),
      h('div.row', {}, h('button.primary', { type: 'button', dataset: { act: 'accept' }, onclick: () => { sendRevive('accept', m.id); riseBox.hidden = true; R.ask = null; } }, 'Accept'),
        h('button.ghost', { type: 'button', dataset: { act: 'decline' }, onclick: () => { sendRevive('decline', m.id); riseBox.hidden = true; R.ask = null; } }, 'No thanks')),
      h('small', {}, 'The offer lasts ', left, '. Rising at the waystone turns it down.'));
    riseBox.hidden = false;
    hud.chat?.(`${m.from || m.name || 'Someone'} offers to raise you${m.skill ? ` with ${m.skill}` : ''}.`, 'party');
  }
  function reviveTick() {
    if (!R.ask) return;
    const ms = R.ask.until - Date.now();
    if (ms <= 0 || !self?.().dead) { riseBox.hidden = true; R.ask = null; return; }
    const el = riseBox.querySelector('.rv-left'); if (el) el.textContent = mmss(ms);
  }

  function wire(n) {
    reveal.wire(n); tracker.wire(n); sheet.wire(n); feedback.wire(n); angling.wire(n);
    n.on('used', u => { if (u && u.ok && u.kind === 'lift' && Array.isArray(u.choices) && u.choices.length) liftAsk(u); });
    n.on('joined', () => { liftBox.hidden = true; });
    n.on('reviveAsk', reviveAsk);
    n.on('reviveOffer', m => reviveAsk({ ...m, from: m.name || m.from, skill: m.skillName || m.skill }));
    n.on('reviveR', r => {
      if (r.op === 'done') hud.toast(`${r.name || 'They'} stands up.`, 'good');
      else if (r.op === 'declined') hud.toast(`${r.name || 'They'} turned the offer down.`, 'info');
      else if (r.op === 'expired') hud.toast(`${r.name || 'They'} did not answer in time.`, 'info');
      else if (r.ok === false) { hud.toast(r.msg || ({ gone: 'That offer has run out.', alive: 'You are already on your feet.' }[r.why]) || 'That offer is no longer open.', 'warn'); riseBox.hidden = true; R.ask = null; }
    });
    n.on('joined', () => { if (!self?.().dead) { riseBox.hidden = true; R.ask = null; } });
    // T7: the server's own words when a piece will not go where you put it
    n.on('itemR', r => { if (r.op === 'equip' && r.ok === false && r.msg) hud.toast(r.msg, 'warn'); });
    n.on('kitsR', m => { const ws = kitWait.get(m.cls); if (ws) { kitWait.delete(m.cls); for (const w of ws) w(m.kits || null); } });
    // the chat's system lines belong in the log ring too
    n.on('chat', m => { if (m.ch === 'system' && m.text) LOG.push('system', m.text); });
    n.on('err', e => LOG.push('server', `${e.code || 'err'}: ${e.msg || ''}`));
  }
  // T5: the kits come from the gateway (A: kits {cls} -> kitsR {cls, kits}); the rules module is the fallback
  const kitWait = new Map();
  /** Ask the server for a calling's kits. Resolves null when it does not answer in time. */
  function askKits(n, cls, ms = 10000) {
    return new Promise(res => {
      const t = setTimeout(() => res(null), ms);
      const list = kitWait.get(cls) || kitWait.set(cls, []).get(cls);      // every asker hears the one answer
      list.push(k => { clearTimeout(t); res(k); });
      if (typeof n.kits === 'function') n.kits(cls); else n._raw?.('gw', JSON.stringify({ t: 'kits', cls }));
    });
  }

  let acc = 0;
  function tick(dt) {
    tracker.tick(dt);
    acc += dt; if (acc < 0.25) return; acc = 0;
    drawAlly(); reviveTick(); drawForms();
    if (self?.().dead && angling.state.state !== 'idle') angling._test.idle();      // a line does not outlive you
  }

  const api = { reveal, tracker, sheet, feedback, kits, angling, wire, tick, askKits,
    /** /feedback, /bug, /suggest from chat (true = it was ours). */
    command(cmd) {
      if (cmd === 'feedback' || cmd === 'suggest' || cmd === 'suggestion') { feedback.open('suggestion'); return true; }
      if (cmd === 'bug' || cmd === 'bugreport') { feedback.open('bug'); return true; }
      if (cmd === 'fish' || cmd === 'cast') { angling.castOrStop(); return true; }
      if (cmd === 'cook') { angling.openCook(); return true; }
      if (cmd === 'stats' || cmd === 'sheet' || cmd === 'character') { sheet.panel.toggle(); return true; }
      return false;
    },
    panels: { sheet: sheet.panel, feedback: feedback.panel },
  };
  // tvui5.fake: the same handlers a server message reaches (screenshots, specs)
  const fakeTaps = new Map();
  api.wire = n0 => {
    const n = Object.create(n0);
    n.on = (ev, fn) => { (fakeTaps.get(ev) || fakeTaps.set(ev, []).get(ev)).push(fn); return n0.on(ev, fn); };
    wire(n);
  };
  window.tvui5 = {
    state: () => ({ reveal: reveal.state, events: tracker.state, sheet: sheet.state, feedback: feedback.state, kits: kits.state, angling: angling.state, revive: R.ask ? { from: R.ask.from, id: R.ask.id } : null, ally: allyNote.hidden ? '' : allyNote.textContent, log: LOG.list() }),
    /** Through every handler in the client when main.js offers it (tv.fake), else this module's own. */
    fake: (ev, msg) => { if (typeof window.tv?.fake === 'function') return window.tv.fake(ev, msg); const fns = fakeTaps.get(ev) || []; for (const fn of fns) fn(msg); return fns.length; },
    sight: () => sightList.map(m => ({ id: m.id, kind: m.kind, name: m.name })), lift: m => liftAsk(m),
    reveal: (item, from) => reveal.show(item, { from }), kits: k => kits.useKits(k), openSheet: (on = true) => sheet.panel.toggle(on), feedback: kind => feedback.open(kind),
    reports: () => feedback.reports.panel.open(), cook: u => angling.openCook(u), catchTab: () => journal?.showTab?.('catch'), fish: angling._test,
  };
  return api;
}
