// The living-world HUD (PLAN §4.3, §5.2–5.4): the clock, waystones (discover, travel, fares), talking to
// town folk and reading notes, the realm event (announcement, countdown, free travel, the event frame),
// open groups ("Group up" in one click), the zone deed feed, and the little "who was here" cards for
// graves, campfires and cleared doors. DOM only; it builds its own markup inside #hud.
//
// Server messages (js/net/client.js events): used {kind: waystone|npc|note|use|grave|campfire|…},
// travelR, realm {kind: eventSoon|eventStart|eventEnd, ev, at, won}, eventFrame, groupHint, zone.

import { clockText, timeName } from './daynight.js';
import { soonText } from './ui/pt2-core.js';
import { crateRewards } from './ui/pt5-core.js';
import { eventListed } from './ui/pt10-core.js';
import { HIDDEN } from './ui/hidden-events.js';

const ROLE_NAME = { smith: 'Smith', merchant: 'Merchant', elder: 'Elder', innkeeper: 'Innkeeper', healer: 'Healer', unbinder: 'Unbinder', broker: 'Broker', guard: 'Guard' };
/** What town folk say when the server sends no lines (their trade, said plainly). */
const ROLE_LINES = {
  smith: ['Bring me anything with an edge and I will put a better one on it.', 'Mind the sparks.'],
  merchant: ['Fair prices, and fairer if you are buying in bulk.', 'Rope, oil, bread — everything a road needs.'],
  elder: ['The roads were safer when I was young. Then again, so was I.', 'If you are heading out, take the waystone path and keep to the light.'],
  innkeeper: ['A bed, a bowl, and no questions. Come back when the sun is down.', 'The stew is mostly turnip. Mostly.'],
  healer: ['Sit. Let me see that cut.', 'Come back alive and I will not have to say I told you so.'],
  unbinder: ['A spell learned wrong can be unlearned — for a price.', 'Everything you learn leaves a mark. I can lift the mark.'],
  broker: ['Blades for hire, if your purse is heavy enough.', 'I know a few people who know a few people.'],
};

/** A fare like the server's (js/sim/province.js travelFare: 2 + round(d / 400), +4000 m for another province). Pure. */
export function estimateFare(from, w, otherProvince = false) {
  const d = Math.hypot(w.x - from.x, w.z - from.z) + (otherProvince ? 4000 : 0);
  return 2 + Math.round(d / 400);
}
/** "4 minutes ago" for a wall-clock ms. Pure. */
export function ago(at, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 50) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? 'a minute ago' : `${m} minutes ago`;
  const h = Math.round(m / 60);
  return h === 1 ? 'an hour ago' : `${h} hours ago`;
}
/** "3 rares slain here this hour" — the zone's deed lines, most interesting first. Pure. */
export function deedLines(d) {
  if (!d) return [];
  const out = [];
  const n = (k, one, many) => { const v = d[k] | 0; if (v > 0) out.push(v === 1 ? one : many.replace('#', v)); };
  n('bosses', 'A boss fell here this hour', '# bosses fell here this hour');
  n('rares', 'A rare was slain here this hour', '# rares slain here this hour');
  n('elites', 'An elite was beaten here this hour', '# elites beaten here this hour');
  n('deaths', 'One adventurer fell here this hour', '# adventurers fell here this hour');
  if ((d.visitors | 0) > 1) out.push(`${d.visitors} travellers passed through this hour`);
  return out;
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function createWorldUi({ hud, net: getNet, me, room, onFootprints, onBanner, callout: sharedCallout = null }) {
  const root = document.getElementById('hud');
  const mk = (cls, html = '', tag = 'div') => { const d = document.createElement(tag); d.className = cls; d.innerHTML = html; root.appendChild(d); return d; };
  const net = () => getNet();

  // ---- clock ----
  const clock = mk('tv-clock', '<i></i><span></span>');
  clock.dataset.tip = 'Time of day in the Vale';
  let lastClock = '';
  function tick(t) {
    const txt = `${timeName(t)} · ${clockText(t)}`;
    if (txt !== lastClock) { lastClock = txt; clock.querySelector('span').textContent = txt; clock.classList.toggle('night', t < 0.22 || t > 0.8); }
    if (event.kind === 'eventSoon') eventEl.querySelector('.ev-time').textContent = soonText(event.at).replace(/^Starts /, '');
  }

  // ---- dialog (npc, note, use, grave, campfire) ----
  const dialog = mk('tv-dialog', '<header><strong></strong><em></em><button class="ghost" aria-label="Close">×</button></header><div class="body"></div><footer></footer>');
  dialog.hidden = true;
  dialog.querySelector('header button').onclick = () => { dialog.hidden = true; };
  function show(title, sub, bodyHtml, buttons = []) {
    dialog.querySelector('strong').textContent = title;
    dialog.querySelector('em').textContent = sub || '';
    dialog.querySelector('.body').innerHTML = bodyHtml;
    const f = dialog.querySelector('footer'); f.innerHTML = '';
    for (const b of buttons) { const x = document.createElement('button'); x.className = b.primary ? 'primary' : 'ghost'; x.textContent = b.text; x.onclick = () => { if (b.on() !== false) dialog.hidden = true; }; f.appendChild(x); }
    if (!buttons.length) { const x = document.createElement('button'); x.className = 'ghost'; x.textContent = 'Close'; x.onclick = () => { dialog.hidden = true; }; f.appendChild(x); }
    dialog.hidden = false;
  }

  // ---- waystones ----
  let known = new Set();
  function setKnown(list) { known = new Set(list || []); }
  function openTravel(fromName = null) {
    const r = room(); const p = me();
    const stones = (r?.waystones || []);
    const rows = stones.map(w => {
      const k = known.has(w.key), here = Math.hypot(w.x - p.x, w.z - p.z) < 8;
      const fare = estimateFare(p, w);
      return `<li class="${k ? '' : 'unknown'}${here ? ' here' : ''}"><span class="ws-name">${esc(k ? w.name : 'Undiscovered waystone')}</span>
        <span class="ws-fare">${here ? 'You are here' : k ? `${fare} gold` : '—'}</span>
        ${k && !here ? `<button class="ghost" data-go="${esc(w.key)}">Travel</button>` : ''}</li>`;
    }).join('');
    const ev = event.live ? `<p class="ws-event">${esc(event.live.name)} is under way. <button class="primary" data-go="event">Travel there free</button></p>` : '';
    show(fromName ? `Waystone — ${fromName}` : 'Waystones', `${known.size} found`, `${ev}<ul class="ws-list">${rows || '<li>No waystones in this province.</li>'}</ul><p class="tiny">Touch a waystone to add it. Travel costs a small fare; it is free to a realm event while it runs.</p>`);
    dialog.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => { net()?.travel(b.dataset.go); dialog.hidden = true; }; });
  }

  function onUsed(u) {
    if (!u.ok) return false;
    switch (u.kind) {
      case 'waystone':
        setKnown(u.known);
        if (u.fresh) { hud.toast(`Waystone found: ${u.name}`, 'good'); hud.chat(`You touch the waystone of ${u.name}. You can travel here from any other waystone now.`, 'system'); }
        openTravel(u.name);
        return true;
      case 'npc': {
        const role = u.role ? (ROLE_NAME[u.role] || u.role) : null;
        const lines = (u.says && u.says.length ? u.says : ROLE_LINES[u.role] || ['Safe roads, traveller.']);
        const line = lines[Math.floor(Math.random() * lines.length)];
        // play-test 2 Q11/Q20: a trader's dialog offers the shop, the barber his chair (ui/pt2.js fills npcButtons)
        const extra = api.npcButtons ? api.npcButtons(u) || [] : [];
        show(u.name || role || 'Someone', role && role !== u.name ? role : '', `<p class="say">“${esc(line)}”</p>${questHtml(u)}`, extra.length ? [...extra, { text: 'Goodbye', on: () => {} }] : []);
        wireQuestButtons(u);
        return true;
      }
      case 'note':
        show(u.name || 'A note', 'Written', `<p class="note-text">${esc(u.text || '')}</p>${questHtml(u)}`);
        wireQuestButtons(u);
        return true;
      case 'use':
        if (u.text) show(u.name || 'Something', '', `<p>${esc(u.text)}</p>${u.buff && u.buff.text ? `<p class="quest">${esc(u.buff.text)}</p>` : ''}`);
        return true;
      case 'grave':
        show(`${u.who || 'Someone'}'s grave`, u.level ? `Level ${u.level}` : '', `<p>${u.by ? `Slain by <b>${esc(u.by)}</b>` : 'Fell here'}${u.at ? `, ${ago(u.at)}` : ''}.</p><p class="tiny">Graves fade after an hour.</p>`);
        return true;
      case 'clue':
        show(u.name || 'A clue', u.chainName ? `${u.chainName} — clue ${u.step + 1} of ${u.of}` : '', `<p class="note-text">${esc(u.text || '')}</p>${u.hint ? `<p class="quest">${esc(u.hint)}</p>` : ''}${u.fresh ? '<p class="tiny">Added to your treasure trail.</p>' : ''}`);
        return true;
      case 'cache':
        hud.toast(`You dig up the ${u.chainName || 'cache'}!`, 'good'); hud.chat(`Treasure found: ${u.chainName || 'a buried cache'}.`, 'loot');
        return true;
      case 'campfire':
        if (u.who) hud.toast(`${u.who}'s campfire — you warm your hands.`, 'info');
        else hud.toast('You make camp. The fire will burn for ten minutes.', 'good');
        return true;
    }
    return false;
  }

  // ---- quests (protocol §15.9): offers + turn-ins in the dialog, a tracker, results ----
  const questNames = new Map();
  const rewardText = r => r?.text || [r?.xp ? `${Math.round(r.xp * 100)}% of a level` : '', r?.gold ? `${r.gold} gold` : '', r?.item ? (typeof r.item === 'string' ? `a ${r.item} item` : `a ${r.item.tier || 'good'} item`) : '', ...crateRewards(r)].filter(Boolean).join(', ');
  function questHtml(u) {
    const offers = u.offers || [], ready = u.ready || [];
    for (const q of offers) questNames.set(q.id, q.name);
    let h = '';
    if (ready.length) h += `<div class="q-block"><h4>Ready to hand in</h4>${ready.map(id => `<div class="q-row"><b>${esc(questNames.get(id) || tracked.find(q => q.id === id)?.name || id)}</b><button class="primary" data-turnin="${esc(id)}">Hand in</button></div>`).join('')}</div>`;
    if (offers.length) h += `<div class="q-block"><h4>${offers.some(q => q.job) ? 'Work on offer' : 'A request'}</h4>${offers.map(q => `<div class="q-row"><div><b>${esc(q.name)}</b>${q.level ? ` <small>lvl ${q.level}</small>` : ''}<p>${esc(q.text || '')}</p>${(q.rewardText || rewardText(q.reward)) ? `<small class="q-reward">Reward: ${esc(q.rewardText || rewardText(q.reward))}</small>` : ''}</div><button class="primary" data-accept="${esc(q.id)}">Accept</button></div>`).join('')}</div>`;
    if (!h && u.quest) h = `<p class="quest">Quest: <b>${esc(String(u.quest).replace(/_/g, ' '))}</b></p>`;
    return h;
  }
  function wireQuestButtons(u) {
    dialog.querySelectorAll('[data-accept]').forEach(b => { b.onclick = () => { net()?.quest?.('accept', b.dataset.accept, u.id); b.disabled = true; }; });
    dialog.querySelectorAll('[data-turnin]').forEach(b => { b.onclick = () => { net()?.quest?.('turnin', b.dataset.turnin, u.id); b.disabled = true; }; });
  }
  const tracker = mk('tv-quests', '<b>Quests</b><ol></ol>');
  tracker.hidden = true;
  let tracked = [];
  function onQuests(m) {
    tracked = m.active || [];
    for (const q of tracked) questNames.set(q.id, q.name);
    tracker.hidden = true;            // play-test P17: the tracker is ui/journal.js now (goal, where, distance)
    tracker.querySelector('ol').innerHTML = tracked.slice(0, 6).map(q => {
      const st = q.steps[q.step] || null;
      return `<li class="${q.ready ? 'ready' : ''}"><b>${esc(q.name)}</b><span>${q.ready ? 'Ready to hand in' : st ? `${esc(st.text)}${st.of > 1 ? ` — ${st.n}/${st.of}` : ''}` : ''}</span></li>`;
    }).join('');
  }
  function onQuestR(r) {
    const name = questNames.get(r.id) || 'the quest';
    if (!r.ok) { hud.toast(r.msg || 'Not now.', 'warn'); return; }
    if (r.op === 'accept') { hud.toast(`Quest accepted: ${name}`, 'good'); hud.chat(`You take on "${name}".`, 'system'); }
    else if (r.op === 'turnin') { hud.toast(`Quest complete: ${name}`, 'good'); hud.chat(`"${name}" is done${r.reward ? ` — ${r.reward.gold || 0} gold${r.reward.items ? ' and an item' : ''}` : ''}.`, 'loot'); dialog.hidden = true; }
    else if (r.op === 'abandon') hud.toast(`Quest dropped: ${name}`, 'info');
  }
  // feedback #108: the server repeats an event's start to everyone who walks into a new zone or room (so a late arrival
  // sees the frame) — the chat line and the big callout are said ONCE per event per session, the frame still updates
  const told = new Set();
  const firstTime = (kind, ev) => { if (HIDDEN.has(ev)) return false; const k = kind + ':' + (ev.uid || ev.id || ev.name || '?'); if (told.has(k)) return false; told.add(k); if (told.size > 400) told.delete(told.values().next().value); return true; };
  // zone events (every copy runs its own, §15.3)
  function onZoneEvent(m) {
    const ev = m.ev || {};
    if (m.kind === 'soon') {
      const fresh = firstTime('zn', ev);
      if (fresh) hud.chat(m.text || `${ev.name || 'Trouble'} is coming${m.at ? ` in ${mmss(m.at - Date.now())}` : ''}.`, 'event');
      if (fresh) callout(m.at ? `${ev.name || 'Trouble'} — ${soonText(m.at).toLowerCase()}` : `${ev.name || 'Trouble'} approaches`, 'phase');
      // R3: a real countdown in the event frame until it begins (never just "starting soon")
      zoneSoon = { name: ev.name || 'A zone event', at: m.at };
      soonTick();
    }
    else if (m.kind === 'start') { zoneSoon = null; zoneLive(ev); if (firstTime('zs', ev)) { hud.chat(m.text || `${ev.name} has begun nearby — join in, everyone shares the credit.`, 'event'); callout(`${ev.name || 'A zone event'} has begun!`, 'enrage'); } onEventFrame({ name: ev.name, hp: ev.hp ?? 1, players: ev.players || 0 }); }
    else if (m.kind === 'end') { zoneSoon = null; if (liveZone && liveZone === (ev.uid || ev.id || ev.name) && !event.live) { liveZone = null; eventEl.className = 'tv-event ended'; eventEl.querySelector('.ev-kind').textContent = m.won ? 'Victory' : 'It is over'; eventEl.querySelector('.ev-time').textContent = ''; setTimeout(() => { if (!liveZone && !event.live) hideEv(); }, 8000); } if (api.tracker) { if (m.won) callout('Victory!', 'victory'); else if (m.called !== 'off') callout(`${ev.name || 'The event'} — failed`, 'phase'); if (Number.isFinite(m.next)) hud.chat(`${ev.name || 'It'} will be ready again in ${mmss(m.next - Date.now())}.`, 'system'); return; } if (m.called === 'off') { hud.chat(`${ev.name || 'The event'} was called off — everyone walked away.`, 'event'); return; } if (Number.isFinite(m.next)) hud.chat(`${ev.name || 'It'} will be ready again in ${mmss(m.next - Date.now())}.`, 'system'); hud.chat(m.won ? `${ev.name} is over — well fought!` : `${ev.name} faded away.`, 'event'); if (m.won) callout('Victory!', 'victory'); }
    else if (ev.name) onEventFrame({ name: `${ev.name}${ev.waves ? ` — wave ${ev.wave}/${ev.waves}` : ''}`, hp: ev.hp ?? 1, players: ev.players || 0 });
  }

  function dropRealm() { event.live = null; event.at = 0; event.kind = 'eventEnd'; if (!liveZone) hideEv(); document.querySelector('.ws-event')?.remove(); }
  function onTravel(r) {
    if (!r.ok && (r.gone || r.why === 'noEvent')) { dropRealm(); hud.toast(r.msg || 'That event is over.', 'info'); return; }
    if (!r.ok) { hud.toast(r.msg || ({ dead: 'You are dead.', combat: 'Not while fighting.', far: 'Stand at a waystone to travel.', gold: `The fare is ${r.cost} gold.`, undiscovered: 'You have not found that waystone yet.', noEvent: 'Nothing is happening right now.' }[r.why]) || 'You cannot travel now.', 'warn'); return; }
    hud.toast(r.to === 'event' ? 'The waystones carry you to the fight — free of charge.' : `You travel by waystone${r.cost ? ` (${r.cost} gold)` : ''}.`, 'good');
  }

  // ---- realm event ----
  const event = { kind: null, at: 0, live: null };
  const eventEl = mk('tv-event', '<button class="ghost ev-x" aria-label="Hide" data-tip="Tuck it away (a bubble by the map brings it back)">–</button><div class="ev-head"><b class="ev-kind"></b><span class="ev-time"></span></div><strong class="ev-name"></strong><div class="ev-sub"></div><button class="primary ev-go">Travel there free</button>');
  eventEl.hidden = true;
  eventEl.querySelector('.ev-go').onclick = () => net()?.travel('event');
  // S1: the panel can be tucked away into a bubble beside the minimap; a new event (or a click on the bubble) brings it back
  const bubble = mk('ev-bubble', '<span>★</span>', 'button');
  bubble.hidden = true; bubble.type = 'button'; bubble.dataset.tip = 'An event is on — click to show it';
  let tucked = null, evKey = null;
  function showEv(key) {
    if (api.tracker) { eventEl.hidden = true; bubble.hidden = true; return; }   // play-test 5 T11/T12: ui/event-tracker.js owns events now
    if (key !== evKey) { evKey = key; tucked = null; }
    if (tucked === evKey) { eventEl.hidden = true; bubble.hidden = false; } else { eventEl.hidden = false; bubble.hidden = true; }
  }
  function hideEv() { eventEl.hidden = true; bubble.hidden = true; evKey = null; }
  eventEl.querySelector('.ev-x').onclick = () => { tucked = evKey; eventEl.hidden = true; bubble.hidden = false; };
  bubble.onclick = () => { tucked = null; eventEl.hidden = false; bubble.hidden = true; };
  /** A zone event that is running gets the same panel (it used to show only a 4 s frame). */
  let liveZone = null;
  function zoneLive(ev, frame = null) {
    if (event.live) return;                                   // the realm event has the panel
    liveZone = ev.uid || ev.id || ev.name;
    eventEl.className = 'tv-event live zone';
    eventEl.querySelector('.ev-kind').textContent = 'Happening now';
    eventEl.querySelector('.ev-time').textContent = frame && frame.players ? `${frame.players} fighting` : '';
    eventEl.querySelector('.ev-name').textContent = ev.name || 'A zone event';
    eventEl.querySelector('.ev-sub').textContent = `${ev.where || where(ev)} — join in: everyone near shares the credit.`;
    showEv('zone:' + liveZone);
  }
  const frameEl = mk('tv-eventframe', '<b></b><div class="bar"><i></i></div><span></span>');
  frameEl.hidden = true;
  let frameUntil = 0;
  function where(ev) { return ev.zoneName || (ev.province ? String(ev.province).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'the province'); }
  function onRealm(m) {
    const ev = m.ev || {};
    event.kind = m.kind;
    if (m.kind === 'eventSoon') {
      event.at = m.at ?? null; event.live = null;
      eventEl.className = 'tv-event soon'; showEv('realm:' + (ev.uid || ev.id));
      eventEl.querySelector('.ev-kind').textContent = ev.kind === 'worldboss' ? 'World boss' : 'Realm event';
      eventEl.querySelector('.ev-name').textContent = ev.name || 'Something stirs';
      eventEl.querySelector('.ev-sub').textContent = `${ev.roamed ? 'It has broken out to ' : 'Gathering in '}${where(ev)}. Waystone travel to it will be free while it runs.`;
      eventEl.classList.toggle('roamed', !!ev.roamed);
      const fresh = firstTime('rn' + (ev.roamed ? ev.roamed : ''), ev);
      if (fresh && m.text) hud.chat(m.text, 'event');        // the event's own announcement (and where it broke out to, M3)
      if (fresh) hud.chat(`Realm event: ${ev.name} will rise in ${where(ev)} — ${soonText(event.at).toLowerCase()}.`, 'event');
      if (fresh) callout(ev.roamed ? `${ev.name} has broken out — to ${where(ev)}!` : `${ev.name} stirs in ${where(ev)}`, 'phase');
    } else if (m.kind === 'eventStart') {
      event.live = ev; event.at = 0;
      eventEl.className = 'tv-event live'; showEv('realm:' + (ev.uid || ev.id));
      eventEl.querySelector('.ev-kind').textContent = 'Happening now';
      eventEl.querySelector('.ev-time').textContent = '';
      eventEl.querySelector('.ev-name').textContent = ev.name || 'A realm event';
      eventEl.querySelector('.ev-sub').textContent = `${where(ev)} — everyone who joins shares the credit; loot is your own.${ev.kind === 'worldboss' ? ' Fighters get a share of the World cache.' : ''}`;
      if (firstTime('rs', ev)) {
        if (m.text) hud.chat(m.text, 'event');
        hud.chat(`${ev.name} has begun in ${where(ev)}! Waystone travel there is free.`, 'event');
        callout(`${ev.name} has begun!`, 'enrage');
      }
    } else if (m.kind === 'eventEnd') {
      event.live = null; event.at = 0;
      eventEl.className = 'tv-event ended';
      eventEl.querySelector('.ev-kind').textContent = m.won ? 'Victory' : 'It is over';
      eventEl.querySelector('.ev-time').textContent = '';
      eventEl.querySelector('.ev-sub').textContent = m.won ? 'The realm owes you a drink.' : 'It slipped away — this time.';
      if (!api.tracker) hud.chat(m.won ? `${ev.name} has been defeated!` : `${ev.name} withdrew.`, 'event');
      setTimeout(() => { if (!event.live && event.kind === 'eventEnd') hideEv(); }, 12000);
    }
  }
  function onEventFrame(f) {
    if (api.tracker) return;
    if (!event.live && f.uid !== 'demo' && f.name) zoneLive({ uid: f.uid, name: f.name.replace(/ — wave .*$/, '') }, f);
    else if (event.live) eventEl.querySelector('.ev-time').textContent = f.players ? `${f.players} fighting` : '';
    frameEl.hidden = false; frameUntil = performance.now() + 4000;
    frameEl.querySelector('b').textContent = f.name;
    frameEl.querySelector('i').style.width = Math.round(Math.max(0, Math.min(1, f.hp)) * 100) + '%';
    frameEl.querySelector('span').textContent = `${f.players} ${f.players === 1 ? 'fighter' : 'fighting'} in range · shared credit`;
  }
  let zoneSoon = null;
  function soonTick() {
    if (!zoneSoon || api.tracker) return;
    frameEl.hidden = false; frameUntil = performance.now() + 1500;
    frameEl.querySelector('b').textContent = zoneSoon.name;
    frameEl.querySelector('i').style.width = '100%';
    frameEl.querySelector('span').textContent = soonText(zoneSoon.at);
    if (Number.isFinite(zoneSoon.at) && zoneSoon.at < Date.now() - 15000) zoneSoon = null;   // it started; the start message clears it anyway
  }
  setInterval(() => { soonTick(); if (!frameEl.hidden && performance.now() > frameUntil) frameEl.hidden = true; }, 1000);

  // ---- open groups ----
  const groupEl = mk('tv-group', '<span></span><button class="primary">Group up</button><button class="ghost">×</button>');
  groupEl.hidden = true;
  let groupKey = null, groupTimer = 0;
  groupEl.querySelector('.primary').onclick = () => { if (groupKey) net()?.partyOp('group', { code: groupKey }); groupEl.hidden = true; };
  groupEl.querySelector('.ghost').onclick = () => { groupEl.hidden = true; };
  function onGroupHint(m) {
    groupKey = m.key;
    const names = (m.with || []).map(w => w.name).filter(Boolean);
    groupEl.querySelector('span').textContent = names.length ? `You are fighting alongside ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}.` : 'Others are fighting the same foe.';
    groupEl.hidden = false;
    clearTimeout(groupTimer); groupTimer = setTimeout(() => { groupEl.hidden = true; }, 20000);
  }

  // ---- zone + deeds ----
  const deedsEl = mk('tv-deeds', '<b></b><ul></ul>');
  deedsEl.hidden = true;
  function onZone(z) {
    const band = Array.isArray(z.band) ? ` · levels ${z.band[0]}–${z.band[1]}` : '';
    hud.zone(z.name || z.zone, { sub: Array.isArray(z.band) ? `Levels ${z.band[0]}–${z.band[1]}` : '' });
    deedsEl.querySelector('b').textContent = (z.name || z.zone) + band;
    const lines = deedLines(z.deeds);
    deedsEl.querySelector('ul').innerHTML = lines.map(l => `<li>${esc(l)}</li>`).join('') || '<li class="quiet">A quiet hour here.</li>';
    deedsEl.hidden = false;
    clearTimeout(onZone.t); onZone.t = setTimeout(() => { deedsEl.hidden = true; }, 14000);   // a feed on arrival, not a fixture over the party frames
    if (lines.length) hud.chat(`${z.name || z.zone}: ${lines.join('; ')}.`, 'system');
    onFootprints?.(z.heat || []);
  }

  // ---- callouts (reuse the boss callout element) ----
  function callout(text, style) {
    // one owner for the banner (R4): two timers on one element let an old event's timer wipe a boss warning mid wind-up
    if (sharedCallout) { sharedCallout(text, style); return; }
    const el = document.getElementById('callout'); if (!el) return;
    el.textContent = text; el.className = `callout show ${style || ''}`;
    clearTimeout(callout.t); callout.t = setTimeout(() => { el.className = 'callout'; }, 3600);
  }

  // ---- lore when you walk into a vignette ----
  const seenLore = new Set();
  function lore(key, name, text) {
    if (!text || seenLore.has(key)) return;
    seenLore.add(key);
    hud.chat(`${name}: ${text}`, 'lore');
    // play-test 2 Q6: a place is the smallest area — it goes through the one banner (it waits behind a zone banner)
    const ob = api.onBanner || onBanner;
    if (ob) { ob({ level: 'place', name, sub: text, lead: 'You come upon' }); return; }
    const el = mk('tv-lore', `<b>${esc(name)}</b><p>${esc(text)}</p>`);
    setTimeout(() => el.classList.add('out'), 7000); setTimeout(() => el.remove(), 8200);
  }

  function wire(n) {
    n.on('travelR', onTravel);
    // play-test 10 (Y11): the server's list of running events after a (re)join — an old panel does not outlive its event
    n.on('eventSync', m => {
      if (event.live && !eventListed({ uid: event.live.uid, id: event.live.id, scope: 'realm' }, m)) dropRealm();
      if (liveZone && !eventListed({ uid: liveZone, id: liveZone }, m)) { liveZone = null; if (!event.live) hideEv(); }
    });
    n.on('realm', onRealm);
    n.on('eventFrame', onEventFrame);
    n.on('groupHint', onGroupHint);
    n.on('zone', onZone);
    n.on('quests', onQuests);
    n.on('questR', onQuestR);
    n.on('zoneEvent', onZoneEvent);
  }
  const api = {
    npcButtons: null, onBanner: null, tracker: null,
    knownWaystones: () => [...known],
    wire, tick, onUsed, openTravel, onQuests, onQuestR, onZoneEvent, setKnown, lore, onRealm, onEventFrame, onGroupHint, onZone, show, callout,
    joined(j) { setKnown(j.you?.waystones); if (j.event) onRealm({ kind: 'eventStart', ev: j.event }); },
    get event() { return event; }, get dialogOpen() { return !dialog.hidden; }, closeDialog() { dialog.hidden = true; },
    ago,
  };
  return api;
}
