// T11 / T12 (play-test 5): the event tracker. One card per event that touches you — a zone event near you, the realm
// event, a road event — in the right column under the minimap. Every card says, in this order:
//   its name · what is happening · the objective with live progress · the time left · the reward
// and when it ends, one clear result line: Won / Failed, and what you got (kept on screen for a while, and in chat).
//
// T11: the old "event happening — travel there" panel is gone. A card for an event you are NOT standing in is two
// lines (name, where, a Travel button when the waystones will carry you free); the moment you are inside it (the
// server's `inRange`, else your distance to its ring) the travel offer disappears and the card is the tracker.
// Any card folds to one line with its – button; a card you folded stays folded until that event ends.
//
// Play-test 8 (W13): a card for an event you are NOT in has a "hide" button (the crossed eye): the event leaves this
// tracker, the minimap and its rim arrow for the rest of the session. One line at the foot — "2 events hidden · Show" —
// brings them back, and so does the Events list on the map. You cannot hide an event you are standing in, and walking
// into a hidden one shows its card for as long as you are there (ui/hidden-events.js, pt8-core.js).
//
// Reads: zoneEvent {kind: soon|start|update|end|states, ev, at, won, why, result} · realm {kind: eventSoon|eventStart|
// eventEnd, ev, at, won} · eventFrame {uid, name, hp, players, n, of, endsAt, inRange} · eventDone {name, xp, gold, items}.
// pt5-core.js mergeEvent / eventLines / eventResult hold the wording (tests/D/pt5.test.js).

import { h } from '../ui-panel.js';
import { mergeEvent, eventLines, eventResult, inEvent } from './pt5-core.js';
import { canHideEvent } from './pt8-core.js';
import { HIDDEN } from './hidden-events.js';
import { staleEvents } from './pt10-core.js';

const RESULT_MS = 14000;

export function createEventTracker({ hud, me, net, parent = null }) {
  const root = h('div.tv-evtrack', { 'aria-live': 'polite', hidden: true });
  (parent || document.getElementById('right-col') || document.getElementById('hud') || document.body).prepend(root);
  const events = new Map();       // key -> entry (pt5-core mergeEvent)
  const folded = new Set();
  const cards = new Map();        // key -> { sig, el }: a card's DOM is kept until its own content changes
  // W13: the foot line that brings hidden events back
  const foot = h('div.et-hidden', { hidden: true }, h('span'), h('button.ghost.small', { type: 'button', dataset: { act: 'unhide' } }, 'Show'));
  const EYE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6 0 10 7 10 7a17.6 17.6 0 0 1-3.2 3.9M6.5 6.6C3.7 8.4 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  const hideBtn = e => { const b = h('button.ghost.et-x.et-hide', { type: 'button', 'aria-label': 'Hide this event', dataset: { act: 'hide', key: e.key, tip: 'Hide this event from your screen. Bring it back from the line under the events, or from the map.' } }); b.innerHTML = EYE; return b; };
  HIDDEN.onChange(() => draw(true));

  /** append, minus the holes: DOM `append(null)` writes the WORD "null" (play-test 6 U9: "Won: Home to Torborhold. null"). */
  const put = (el, ...kids) => { for (const k of kids.flat()) if (k != null && k !== false && k !== '') el.append(k); return el; };
  const keyOf = ev => String(ev?.uid ?? ev?.id ?? ev?.name ?? '');
  function find(ev) {
    const k = keyOf(ev);
    if (events.has(k)) return k;
    // a progress frame may name the event only by name ("X — wave 2/3")
    const name = String(ev?.name || '').replace(/ — wave .*$/, '');
    for (const [key, e] of events) if (e.name === name || (ev?.id != null && e.id === ev.id)) return key;
    return k;
  }
  function upsert(ev, opts) {
    if (!ev || !(ev.uid ?? ev.id ?? ev.name)) return null;
    const k = find(ev);
    const e = mergeEvent(events.get(k), ev, opts);
    e.key = k; if (ev.id != null) e.id = ev.id;
    events.set(k, e);
    return e;
  }
  function end(ev, m, scope) {
    const k = find(ev);
    const e = events.get(k) || mergeEvent(null, ev, { scope });
    const res = eventResult(m, e.name);
    const already = e.state === 'won' || e.state === 'lost';          // eventDone got here first: keep what it said you got
    const hadGot = already && e.got && !/^No reward/.test(e.got) ? e.got : '';
    e.state = already ? e.state : res.won ? 'won' : 'lost'; e.result = already ? e.result : res.text; e.got = hadGot || res.got; e.endedAt = e.endedAt || Date.now(); e.key = k;
    events.set(k, e); folded.delete(k);
    if (!already) { hud.chat?.(`${res.text}${e.got ? ' ' + e.got : ''}`, 'event'); hud.toast?.(res.won ? `Won: ${e.name}` : `Failed: ${e.name}`, res.won ? 'good' : 'warn'); }
    draw(true);
    return e;
  }

  // ---- messages ----
  function onZoneEvent(m) {
    const ev = m.ev || {};
    if (m.kind === 'states') return;                              // the map's list of what CAN happen here — not a running event
    if (m.kind === 'soon') upsert({ ...ev, at: m.at ?? ev.at }, { state: 'soon', scope: 'zone' });
    else if (m.kind === 'start') { const e = upsert(ev, { state: 'live', scope: 'zone' }); if (e) { e.state = 'live'; folded.delete(e.key); } }
    else if (m.kind === 'end') end(ev, m, 'zone');
    else if (ev.name || ev.uid != null) upsert(ev, { state: 'live', scope: 'zone' });
    draw();
  }
  function onRealm(m) {
    const ev = m.ev || {};
    if (m.kind === 'eventSoon') upsert({ ...ev, at: m.at ?? ev.at }, { state: 'soon', scope: 'realm' });
    else if (m.kind === 'eventStart') { const e = upsert(ev, { state: 'live', scope: 'realm' }); if (e) { e.state = 'live'; e.free = true; } }
    else if (m.kind === 'eventEnd') end(ev, m, 'realm');
    draw();
  }
  function onFrame(f) {
    if (!f || (!f.name && f.uid == null)) return;
    const k = find(f), had = events.get(k);
    if (had && had.state !== 'live' && had.state !== 'soon') return;     // a late frame after the result
    upsert(f, { state: 'live' });
    draw();
  }
  /** A's 1 Hz `eventTrack`: everything about one event you are in or near (the main feed when the server sends it). */
  function onTrack(m) {
    if (!m || (m.uid == null && m.id == null && !m.name)) return;
    const k = find(m), had = events.get(k);
    if (had && (had.state === 'won' || had.state === 'lost')) return;
    const st = m.state === 'soon' ? 'soon' : m.state === 'offer' ? 'offer' : 'live';     // offer: a road event someone may take on
    const e = upsert(m, { state: st });
    if (e) { e.state = st; e.tracked = true; e.seen = Date.now(); if (m.realm) e.free = true; }
    draw();
  }
  /** `eventAt {uid|null}`: you walked into / out of an event's ground. */
  function onAt(m) {
    for (const [k, e] of events) e.inRange = m.uid != null && (k === String(m.uid) || (m.id != null && e.id === m.id));
    draw();
  }
  /** The personal reward: folded into the result card if the end line is already up (or arrives in a moment). */
  function onDone(m) {
    const k = find(m), e = events.get(k);
    const res = eventResult(typeof m.result === 'string' ? m : { ...m, won: m.won ?? true }, e?.name || m.name);
    if (e && (e.state === 'won' || e.state === 'lost')) { if (res.got && res.got !== e.got) { e.got = res.got; hud.chat?.(res.got, 'loot'); } }
    else { const n = e || mergeEvent(null, m, {}); n.key = k; n.state = res.won ? 'won' : 'lost'; n.result = res.text; n.got = res.got; n.endedAt = Date.now(); events.set(k, n); hud.chat?.(`${res.text}${res.got ? ' ' + res.got : ''}`, 'event'); }
    draw(true);
  }

  // ---- drawing ----
  function card(e, now, p) {
    const L = eventLines(e, { now, me: p });
    const ended = e.state === 'won' || e.state === 'lost';
    const fold = folded.has(e.key) && !ended;
    const far = !L.inside && !ended && Number.isFinite(e.x) && p ? Math.hypot(e.x - p.x, e.z - p.z) : null;
    const whereText = L.where || (far != null && far > (e.r || 40) ? `${Math.max(10, Math.round(far / 10) * 10).toLocaleString()} m away` : '');
    const head = h('div.et-head', {},
      h('b.et-state', {}, L.head), L.time ? h('span.et-time' + (L.urgent ? '.urgent' : ''), {}, L.time) : null,
      canHideEvent(e, L.inside) ? hideBtn(e) : null,
      ended ? h('button.ghost.et-x', { type: 'button', 'aria-label': 'Dismiss', dataset: { act: 'drop', key: e.key } }, '×')
        : h('button.ghost.et-x', { type: 'button', 'aria-label': fold ? 'Show the event' : 'Fold the event to one line', dataset: { act: 'fold', key: e.key, tip: fold ? 'Show it all' : 'Fold to one line' } }, fold ? '+' : '–'));
    const el = h(`section.et-card.${e.state}${L.inside ? '.inside' : '.outside'}${fold ? '.folded' : ''}${e.scope === 'realm' ? '.realm' : ''}`, { dataset: { key: e.key } }, head, h('strong.et-name', {}, L.name));
    if (fold) return el;
    if (ended) {
      put(el, h('p.et-result', {}, L.result), e.got ? h('p.et-got', {}, e.got) : null);
      return el;
    }
    if (!L.inside && e.state === 'live') {
      // T11: outside the event = a short notice, never a fixture
      put(el, h('p.et-what', {}, [L.what, whereText].filter(Boolean).join(' — ') || 'Happening near you.'));
      if (e.scope === 'realm' && e.free !== false) put(el, h('button.primary.small.et-go', { type: 'button', dataset: { act: 'travel' } }, 'Travel there free'));
      return el;
    }
    if (L.what) put(el, h('p.et-what', {}, L.what));
    if (e.state === 'soon' && whereText) put(el, h('p.et-what.dim', {}, whereText));
    if (L.stage) put(el, h('p.et-stage', {}, L.stage));
    if (L.objective && e.state === 'live') {
      put(el, h('div.et-obj', {}, h('span.et-label', {}, 'Objective'), h('span.et-objtext', {}, L.objective.text), L.objective.count ? h('b.et-count', {}, L.objective.count) : null),
        L.objective.frac != null ? h('div.et-bar', { role: 'progressbar', 'aria-valuenow': String(Math.round(L.objective.frac * 100)), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i', { style: `width:${(L.objective.frac * 100).toFixed(1)}%` })) : null);
    }
    if (L.reward) put(el, h('div.et-reward', {}, h('span.et-label', {}, 'Reward'), h('span', {}, L.reward)));
    if (L.players && e.state === 'live') put(el, h('p.et-players', {}, `${L.players} · everyone here shares the credit`));
    return el;
  }
  function draw(force = false) {
    const now = Date.now(), p = me();
    for (const [k, e] of events) {
      if ((e.state === 'won' || e.state === 'lost') && now - (e.endedAt || 0) > RESULT_MS) events.delete(k);
      else if (e.state === 'soon' && Number.isFinite(e.at) && now - e.at > 20000) events.delete(k);              // it never started
      else if (e.state === 'live' && Number.isFinite(e.endsAt) && now - e.endsAt > 60000) events.delete(k);    // the server went quiet about it
      else if (e.tracked && (e.state === 'live' || e.state === 'soon' || e.state === 'offer') && now - (e.seen || 0) > 15000) events.delete(k);   // you walked out of hearing
    }
    // W13: hidden events stay off the screen — unless you are standing in one, or it just ended with a result for you
    const all = [...events.values()];
    const shownNow = e => !HIDDEN.has(e) || inEvent(e, p) || ((e.state === 'won' || e.state === 'lost') && !!e.got && !/^No reward/.test(e.got));
    const list = all.filter(shownNow).sort((a, b) => (inEvent(b, p) - inEvent(a, p)) || (a.since - b.since));
    const hiddenN = all.length - list.length;
    // the clock ticks every second: when ONLY the time changed, patch the text in place (a rebuilt card would swallow a
    // click that lands between pointer-down and pointer-up, and drop the tooltip under the pointer)
    const lines = list.map(e => eventLines(e, { now, me: p }));
    // Each card is rebuilt only when ITS OWN content changed (the clock is patched in place): a server that talks about
    // one event every second must never rebuild the card of another — a rebuilt card swallows the click that lands
    // between pointer-down and pointer-up, and drops the tooltip under the pointer.
    const els = list.map((e, i) => {
      const sg = JSON.stringify([e.state, folded.has(e.key), { ...lines[i], time: !!lines[i].time, urgent: 0 }, e.got, e.free, p && Number.isFinite(e.x) && !lines[i].inside ? Math.round(Math.hypot(e.x - p.x, e.z - p.z) / 10) : 0]);
      let c = cards.get(e.key);
      if (!c || c.sig !== sg || force) { c = { sig: sg, el: card(e, now, p) }; cards.set(e.key, c); }
      else { const t = c.el.querySelector('.et-time'); if (t) { if (t.textContent !== lines[i].time) t.textContent = lines[i].time; t.classList.toggle('urgent', !!lines[i].urgent); } }
      return c.el;
    });
    for (const k of [...cards.keys()]) if (!events.has(k)) cards.delete(k);
    root.hidden = !list.length && !hiddenN;
    foot.hidden = !hiddenN;
    if (hiddenN) { const t = `${hiddenN} event${hiddenN === 1 ? '' : 's'} hidden`; if (foot.firstChild.textContent !== t) foot.firstChild.textContent = t; if (foot.parentNode !== root || root.lastChild !== foot) root.append(foot); els.push(foot); }
    else if (foot.parentNode) foot.remove();
    const cur = [...root.children];
    if (cur.length !== els.length || cur.some((c, i) => c !== els[i])) {
      // put changed cards in place one by one, leaving the untouched ones attached
      for (const c of cur) if (!els.includes(c)) c.remove();
      els.forEach((el, i) => { if (root.children[i] !== el) root.insertBefore(el, root.children[i] || null); });
    }
  }
  root.addEventListener('click', ev => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const k = b.dataset.key;
    if (b.dataset.act === 'fold') { if (folded.has(k)) folded.delete(k); else folded.add(k); }
    else if (b.dataset.act === 'drop') events.delete(k);
    else if (b.dataset.act === 'hide') { const e = events.get(k); if (e) { HIDDEN.hide(e); hud.toast?.(`${e.name || 'That event'} is hidden. The line under the events (or the map) brings it back.`, 'info'); } return; }
    else if (b.dataset.act === 'unhide') { for (const e of events.values()) HIDDEN.show(e); HIDDEN.showAll(); return; }
    else if (b.dataset.act === 'travel') net()?.travel?.('event');
    draw(true);
  });

  /** Play-test 10 (Y11): the server's list of what is running for you (`eventSync`, after every join / reconnect) —
   *  a card that still claims to be running and is not on it goes away, with its "Travel there free" button. */
  function onSync(m) {
    const gone = staleEvents([...events.values()].map(e => ({ key: e.key, uid: e.uid, id: e.id, scope: e.scope, state: e.state, at: e.at })), m);
    for (const k of gone) { events.delete(k); folded.delete(k); }
    if (gone.length) draw(true);
    return gone;
  }
  /** `travelR {gone:true}`: "that event is over" — every running realm event card goes. */
  function onGone() { onSync({ live: [...events.values()].filter(e => e.scope !== 'realm' && !e.free).map(e => e.uid ?? e.id ?? e.key), realm: null }); }

  let acc = 0;
  return {
    root, onZoneEvent, onRealm, onFrame, onDone, onTrack, onAt, onSync, onGone, draw,
    wire(n) { n.on('eventSync', onSync); n.on('travelR', r => { if (r && r.ok === false && (r.gone || r.why === 'noEvent')) onGone(); }); n.on('zoneEvent', onZoneEvent); n.on('realm', onRealm); n.on('eventFrame', onFrame); n.on('eventDone', onDone); n.on('eventTrack', onTrack); n.on('eventAt', onAt); n.on('joined', j => { if (j.event) onRealm({ kind: 'eventStart', ev: j.event }); if (j.you?.eventAt != null) setTimeout(() => onAt({ uid: j.you.eventAt }), 0); }); },
    tick(dt) { acc += dt; if (acc < 0.5) return; acc = 0; draw(); },
    clear() { events.clear(); folded.clear(); draw(true); },
    get state() { const now = Date.now(), p = me(); return [...events.values()].map(e => ({ ...eventLines(e, { now, me: p }), got: e.got || '', folded: folded.has(e.key), hidden: HIDDEN.has(e) })); },
    /** W13: hide / show one event by its key (the map uses the same set through ui/hidden-events.js). */
    hide(key) { const e = events.get(String(key)); return e ? HIDDEN.hide(e) : false; }, hidden: HIDDEN,
  };
}
