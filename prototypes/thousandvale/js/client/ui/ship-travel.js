// The Harbourmaster's window and the voyage banner (Expansion 1 §6, stream V).
//
// Talk to the Harbourmaster on the quay (Gullwick on Torbor Downs, Port Vharl on Vharlen): their hello gives way to this
// window — the far harbour, what land it is and its levels, the time at sea, the fare in gold, and Set sail (a second
// press confirms: "Pay 60 and sail"). A ship that cannot go says why in words ("not sailing yet", "60 gold").
// "Bring my party" boards every party member standing near the Harbourmaster who can pay their own fare.
// While at sea a banner at the top shows the crossing and, after five seconds, a Skip button.
// The logbook: a "Voyages" page in the journal (your first crossing, how many since).
//
// Server (js/sim/ships.js): `use` the Harbourmaster -> `used {kind:'npc', role:'harbourmaster'}` then `shipList {id, from,
// name, master, says, sailings:[{id, name, land, province, fare, s, band?, locked?, why?, msg?}], gold, log}`; we send
// `ship {op:'go', id, to, party}` -> `shipR {op:'go', ok, name, fare, crew, left?}` then `shipSail`; `ship {op:'skip'}`.

import { createPanel, h } from '../ui-panel.js';

const CSS_ID = 'tv-ship-css';
function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
  const l = document.createElement('link'); l.id = CSS_ID; l.rel = 'stylesheet'; l.href = new URL('../../../css/ship.css', import.meta.url).href;
  document.head.appendChild(l);
}

/** Pure: the rows the window draws. -> [{ id, name, land, fare, secs, band, locked, why }] */
export function sailRows(m) {
  const gold = Number.isFinite(m?.gold) ? m.gold : null;
  return (m?.sailings || []).map(r => {
    let why = r.locked ? (r.msg || 'Not now.') : null;
    if (!r.locked && gold != null && gold < r.fare) why = `You need ${r.fare - gold} more gold.`;
    return { id: r.id, name: r.name, land: r.land || '', fare: r.fare, secs: r.s, band: Array.isArray(r.band) ? r.band : null, locked: !!why, closed: r.why === 'closed', why };
  });
}
/** Pure: the logbook in words. */
export function logText(log) {
  if (!log || !log.first) return ['No voyages yet. The Harbourmasters at Gullwick and Port Vharl sell the passage.'];
  const day = at => { try { return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } };
  const out = [`First voyage: ${log.first.from} to ${log.first.to}${log.first.at ? ', ' + day(log.first.at) : ''}.`];
  out.push(`Crossings made: ${log.n || 1}.`);
  if (log.last && log.n > 1) out.push(`Last: ${log.last.from} to ${log.last.to}.`);
  return out;
}

export function createShipTravel({ net, hud, onOpen = null, journal = () => null, onSkip = null }) {
  ensureCss();
  const S = { m: null, pick: null, going: false, timer: 0, party: true, log: null, tab: null };
  const panel = createPanel({ id: 'ship', title: 'Harbourmaster', width: 400, cls: 'ship-panel', onClose: () => { S.pick = null; S.going = false; clearTimeout(S.timer); } });
  const gold = () => (Number.isFinite(S.m?.gold) ? S.m.gold : net()?.joined?.you?.gold ?? null);

  function send(op, extra) { const n = net(); if (!n) return false; if (typeof n._raw !== 'function') return false; n._raw('game', JSON.stringify({ t: 'ship', op, ...extra })); return true; }

  function draw() {
    const m = S.m; if (!m || !panel.isOpen) return;
    const rows = sailRows({ ...m, gold: gold() });
    panel.setTitle(`${m.name || 'The'} harbour`, m.master ? `${m.master}, Harbourmaster` : 'Harbourmaster');
    const row = r => {
      const picked = S.pick === r.id;
      const facts = [r.land, r.band ? `levels ${r.band[0]}–${r.band[1]}` : '', r.secs ? `about ${r.secs} seconds at sea` : ''].filter(Boolean).join(' · ');
      return h('li.cart-row.ship-row' + (r.locked ? '.locked' : '') + (picked ? '.picked' : ''), { dataset: { harbour: r.id } },
        h('div.cart-where', {}, h('b', {}, r.name), h('small', {}, facts), r.why ? h('small.bad', {}, r.why) : null),
        h('span.cart-fare', {}, `${Number(r.fare).toLocaleString()} gold`),
        picked
          ? h('span.cart-confirm', {}, h('button.ghost.small', { type: 'button', dataset: { act: 'no' }, onclick: () => { S.pick = null; draw(); } }, 'Not now'),
              h('button.primary.small', { type: 'button', disabled: S.going, dataset: { act: 'go' }, onclick: () => go(r) }, S.going ? 'Boarding…' : `Pay ${Number(r.fare).toLocaleString()} and sail`))
          : h('button.primary.small', { type: 'button', disabled: r.locked, dataset: { act: 'pick' }, onclick: () => { S.pick = r.id; draw(); panel.body.querySelector('.ship-row.picked [data-act="go"]')?.focus({ preventScroll: true }); } }, 'Set sail'));
    };
    panel.fill(
      m.says ? h('p.ship-says', {}, `“${m.says}”`) : null,
      h('p.cart-lead', {}, `${m.service?.ship ? m.service.ship[0].toUpperCase() + m.service.ship.slice(1) : 'The ship'} crosses the open sea between the two lands. It is the only way across: no waystone reaches the other shore.`),
      rows.length ? h('ul.cart-list', {}, ...rows.map(row)) : h('p.empty', {}, 'No ship sails from here.'),
      h('label.ship-party', {}, h('input', { type: 'checkbox', checked: S.party, onchange: e => { S.party = !!e.target.checked; } }), ' Bring my party (each pays their own fare)'),
      h('p.note'),
      h('div.row.end', {}, h('span.cart-purse', {}, gold() != null ? `You carry ${gold().toLocaleString()} gold` : ''), h('span.grow'), h('button.ghost.small', { type: 'button', onclick: () => panel.close() }, 'Stay ashore')));
  }
  function note(text) { const n = panel.body.querySelector('.note'); if (n) n.textContent = text; }
  function go(r) {
    if (S.going) return;
    if (!send('go', { id: S.m.id, to: r.id, party: S.party })) { note('You are not connected.'); return; }
    S.going = true; draw();
    clearTimeout(S.timer);
    S.timer = setTimeout(() => { if (S.going) { S.going = false; draw(); note('The Harbourmaster did not answer. Try again.'); } }, 8000);
  }
  function open(m) {
    if (!m || !Array.isArray(m.sailings)) return false;
    S.m = { ...m }; S.pick = null; S.going = false;
    if (m.log) setLog(m.log);
    onOpen?.(); panel.open(); draw();
    return true;
  }

  // ---- the logbook page in the journal ----
  function setLog(log) {
    S.log = log || S.log;
    const j = journal();
    if (!j?.addTab) return;
    if (!S.tab) S.tab = j.addTab('voyages', 'Voyages', () => [h('div.ship-log', {}, h('h4', {}, 'Logbook'), ...logText(S.log).map(t => h('p', {}, t)))]);
    else j.redraw?.();
  }

  // ---- the banner while at sea ----
  const banner = typeof document !== 'undefined' ? h('div.ship-banner', { hidden: true, 'aria-live': 'polite' }) : null;
  if (banner) (document.getElementById('hud') || document.body).appendChild(banner);
  const B = { ms: 0, skipMs: 5000, on: false };
  function voyageStart({ from, to, ms, skipMs }) {
    if (!banner) return;
    Object.assign(B, { ms, skipMs: skipMs ?? 5000, on: true, shown: -1 });
    banner.replaceChildren(
      h('div.sb-route', {}, h('span', {}, from || ''), h('i', {}, ' ⟶ '), h('b', {}, to || '')),
      h('div.sb-bar', {}, h('i.sb-fill')),
      h('button.ghost.small.sb-skip', { type: 'button', disabled: true, onclick: () => { onSkip?.(); const b = banner.querySelector('.sb-skip'); if (b) { b.disabled = true; b.textContent = 'Coming ashore…'; } } }, 'Skip the voyage'));
    banner.hidden = false;
  }
  function voyageTick(ms) {
    if (!banner || !B.on) return;
    const f = banner.querySelector('.sb-fill'); if (f) f.style.width = `${Math.min(100, (ms / Math.max(1, B.ms)) * 100).toFixed(1)}%`;
    const b = banner.querySelector('.sb-skip');
    if (b && b.textContent === 'Skip the voyage') { const left = Math.ceil((B.skipMs - ms) / 1000); b.disabled = left > 0; b.dataset.left = left > 0 ? String(left) : ''; }
  }
  function voyageEnd() { if (!banner) return; B.on = false; banner.hidden = true; }

  function wire(n) {
    n.on('shipList', open);
    n.on('shipR', r => {
      if (r.op === 'arrive') {
        if (r.ok && r.log) setLog(r.log);
        if (r.ok && r.first) hud?.toast?.(`First voyage — written in your journal (Voyages).`, 'good');
        return;
      }
      if (r.op === 'skip') { if (r.ok === false && r.msg) hud?.toast?.(r.msg, 'warn'); return; }
      S.going = false; clearTimeout(S.timer);
      if (r.ok === false) { if (panel.isOpen) { draw(); note(r.msg || 'Not now.'); } else hud?.toast?.(r.msg || 'Not now.', 'warn'); return; }
      const crew = Array.isArray(r.crew) && r.crew.length > 1 ? ` with ${r.crew.slice(1).join(', ')}` : '';
      hud?.chat?.(r.with ? `${r.with} sets sail for ${r.name} and you go aboard with the party — your fare, ${r.fare} gold.` : `You board the ship for ${r.name}${crew} — ${r.fare} gold.`, 'system');
      for (const l of r.left || []) hud?.chat?.(`${l.name} stays ashore (${l.why === 'gold' ? 'cannot pay the fare' : l.why === 'busy' ? 'busy' : l.why === 'fight' ? 'in a fight' : l.why}).`, 'system');
      panel.close();
    });
    n.on('you', p => { if (p.gold != null && S.m && panel.isOpen) { S.m.gold = p.gold; draw(); } });
    n.on('joined', j => { if (panel.isOpen) panel.close(); const log = j?.you?.flags?.voyages; if (log) setLog(log); });
  }
  return { panel, wire, open, draw, voyageStart, voyageTick, voyageEnd, setLog, get state() { return { open: panel.isOpen, from: S.m?.from || '', pick: S.pick, going: S.going, party: S.party, rows: S.m ? sailRows({ ...S.m, gold: gold() }) : [], banner: banner ? !banner.hidden : false }; } };
}
