// The play-test-10 interface in one place (stream D-UI), so main.js only creates it, wires it and ticks it:
//   Y30 the changelog (ui/changelog.js)                 Y5  /wave /sit /dance … + the quick wheel's emote row
//   Y36 tracking a party member or friend: their marker on the map and the minimap (with the minimap's own rim arrow
//       and distance), an arrow on the edge of the SCREEN with the distance until you are near, and the rows of the
//       map's Party section (ui/worldmap.js draws them; the rule is pt10-core.js partyPeople)
// The rest of the round lives where it belongs: Y33 ui/portraits.js + portrait-mode.js · Y27 ui/keep-scroll.js ·
// Y39 ui-panel.js mountConfirm + css/pt10.css · Y38 ui/talent-model.js hasTree · Y37 social.js / party-hub.js ·
// Y11 event-tracker.js / atlas.js / world-ui.js · Y29 ui/title-front.js · Y28 ui/worldmap.js · Y22 ui/map-data.js.
//
//   const ui10 = createUi10({ ...main's pieces });  ui10.wire(net);  ui10.tick(dt)
// window.tvui10 = test hooks.

import { h } from '../ui-panel.js';
import { createChangelog } from './changelog.js';
import { createClassRes } from './class-res.js';
import { partyPeople, whereRow, isInstance, TRACK_MAX, TRACK_NEAR_M, trackRefusal, trackBearing, edgeArrow, metresText, EMOTES, emoteFor, emoteRefusal, whereText } from './pt10-core.js';
import { uiIconSvg } from '../../../../../icons/js/game-icons.js';

export function createUi10(o) {
  const { net, hud, actors, atlas, me, pos, worldMap = null, settings = null, camYaw = () => 0, room = () => null } = o;

  // ---------------------------------------------------------------- Y30: the changelog
  const changelog = createChangelog({ net });
  changelog.button(document.getElementById('title-changelog'));
  // in the game: the pause menu (Esc) gets "What's new" above "Help and controls"
  const pauseList = document.querySelector('#panel-pause .pause-list');
  if (pauseList && !pauseList.querySelector('[data-act="changelog"]')) {
    const b = h('button.ghost.wide.cl-open', { type: 'button', dataset: { act: 'changelog' }, onclick: () => { settings?.pause?.close?.(); } }, 'What\'s new');
    (pauseList.querySelector('[data-act="help"]') || pauseList.lastElementChild)?.before(b);
    changelog.button(b);
  }

  // ---------------------------------------------------------------- Y32: the class resource on your frame (Starlight)
  const classRes = createClassRes();

  // ---------------------------------------------------------------- Y36: tracking
  const T = { tracked: new Map(), where: new Map(), frames: [], asked: new Map() };     // tracked: char -> { char, name, kind: 'party'|'friend' }
  const self = () => { const p = pos?.() || {}, m = me?.() || {}; return { char: m.char ?? net()?.joined?.you?.char ?? null, name: m.name, level: m.level, cls: m.cls, x: p.x, z: p.z, room: net()?.joined?.room?.id ?? room()?.id ?? null }; };
  const bodyOf = (char, f) => { const a = f?.id != null ? actors?.get?.(f.id) : null; return a && !isInstance(self().room) ? { x: a.pos.x, z: a.pos.z } : null; };
  /** Everyone in the party, yourself first (the map's Party section). */
  const people = () => partyPeople({ party: net()?.party || null, frames: T.frames, self: self(), tracked: new Set([...T.tracked.keys()].map(String)), where: T.where, bodies: bodyOf });
  /** Where a tracked person is right now, or null: party frames first (2 Hz), then the server's whereabouts (1 Hz). */
  function spot(char) {
    const row = people().find(p => String(p.char) === String(char));
    if (row && row.placed) return { x: row.x, z: row.z, where: row.where, online: row.online };
    const w = T.where.get(String(char));
    if (w && Number.isFinite(w.x) && w.roomKind !== 'instance' && w.roomKind !== 'dungeon') return { x: w.x, z: w.z, where: whereText(w), online: true };
    return row ? { x: NaN, z: NaN, where: row.where, online: row.online } : w ? { x: NaN, z: NaN, where: whereText(w), online: true } : null;
  }
  function track(char, name = null, kind = 'friend') {
    const k = String(char);
    if (T.tracked.has(k)) return untrack(char);
    if (T.tracked.size >= TRACK_MAX) { hud.toast(trackRefusal({ why: 'full' }), 'warn'); return false; }
    T.tracked.set(k, { char, name: name || 'Someone', kind });
    try { net()?.track?.(char); } catch { /* not connected */ }
    hud.toast(`Tracking ${name || 'them'}: an arrow at the edge of the screen and on the minimap leads to them.`, 'info');
    changed();
    return true;
  }
  function untrack(char, { quiet = false } = {}) {
    const k = String(char), t = T.tracked.get(k);
    if (!t) return false;
    T.tracked.delete(k); T.where.delete(k);
    try { net()?.track?.(char, true); } catch { /* not connected */ }
    if (!quiet) hud.toast(`No longer tracking ${t.name}.`, 'info');
    changed();
    return false;
  }
  const listeners = new Set();
  const changed = () => { for (const f of listeners) { try { f(); } catch { /* a listener's own problem */ } } };

  // markers: every party member the map cannot already place (another room), and everyone tracked
  if (atlas) {
    const prev = atlas.extraMarkers;
    atlas.extraMarkers = () => {
      const base = prev ? prev() || [] : [];
      if (atlas.dungeon) return base;
      const out = [], myRoom = self().room;
      for (const p of people()) {
        if (p.self || !p.placed) continue;
        const f = T.frames.find(r => String(r.char) === String(p.char));
        if (f && f.room === myRoom) continue;                 // the atlas draws the members who share your room (it has their bodies)
        const tr = T.tracked.has(String(p.char));
        out.push({ id: 'pm:' + p.char, kind: 'party', x: p.x, z: p.z, name: p.name, sub: `Party member${p.where ? ' — ' + p.where : ''}`, priority: tr ? 7 : 4, size: tr ? 8 : 6, tracked: tr });
      }
      for (const t of T.tracked.values()) {
        if (t.kind === 'party' || out.some(m => m.id === 'pm:' + t.char)) continue;
        const s = spot(t.char);
        if (s && Number.isFinite(s.x)) out.push({ id: 'trk:' + t.char, kind: 'party', x: s.x, z: s.z, name: t.name, sub: `Friend${s.where ? ' — ' + s.where : ''} · tracked`, priority: 7, size: 8, tracked: true });
      }
      return out.length ? base.concat(out) : base;
    };
    atlas.trackedChar = char => T.tracked.has(String(char));      // the atlas's own party markers ask this (a tracked one gets the distance on the minimap's rim)
  }

  // the arrow on the edge of the screen: one per tracked person, with the name and the distance, until you are near
  const arrows = h('div.tv-trackarrows', { 'aria-hidden': 'true' });
  (document.getElementById('hud') || document.body).appendChild(arrows);
  const arrowEls = new Map();
  function drawArrows() {
    const s = self(), W = window.innerWidth, H = window.innerHeight, yaw = camYaw() || 0;
    const live = new Set();
    for (const t of T.tracked.values()) {
      const sp = spot(t.char);
      const b = sp && Number.isFinite(sp.x) && Number.isFinite(s.x) && !isInstance(s.room) ? trackBearing(s, sp, yaw, TRACK_NEAR_M) : null;
      if (!b) continue;
      live.add(String(t.char));
      let el = arrowEls.get(String(t.char));
      if (!el) { el = h('div.tv-trackarrow', { dataset: { char: String(t.char) } }, h('i'), h('span')); arrows.appendChild(el); arrowEls.set(String(t.char), el); }
      // straight ahead = the top edge; behind you = the bottom edge
      const far = Math.max(W, H) * 2, e = edgeArrow(W / 2 + Math.cos(b.angle) * far, H * 0.46 + Math.sin(b.angle) * far, W, H, { margin: Math.min(84, Math.max(56, H * 0.12)) }) || { x: W / 2, y: 70, angle: b.angle };
      el.style.transform = `translate(${Math.round(e.x)}px, ${Math.round(e.y)}px)`;
      el.firstChild.style.transform = `rotate(${(b.angle * 180 / Math.PI).toFixed(1)}deg)`;
      const text = `${t.name} · ${metresText(b.dist)}`;
      if (el.lastChild.textContent !== text) el.lastChild.textContent = text;
    }
    for (const [k, el] of arrowEls) if (!live.has(k)) { el.remove(); arrowEls.delete(k); }
  }

  // ---------------------------------------------------------------- Y5: emotes
  function emote(id) {
    const e = emoteFor(id); if (!e) return false;
    const n = net(); if (!n) { hud.toast('You are not connected.', 'warn'); return true; }
    if (typeof n.emote === 'function') n.emote(e); else n._raw?.('game', JSON.stringify({ t: 'emote', id: e }));
    return true;
  }
  // the quick wheel's third ring (pad: hold LB, RB steps the rings; phone: tap the wheel's middle): one slice an emote
  const EMOTE_ICON = {
    wave: '<path d="M7 20c-2-3-3-6-2-8l2 1V7a1.5 1.5 0 0 1 3 0V5a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v2a1.5 1.5 0 0 1 3 0v6c0 4-3 7-7 7-2 0-4-1-5-1Z"/><path d="M3 5c1-1 2-2 3-2M2 9c0-1 0-2 1-3"/>',
    sit: '<circle cx="9" cy="5" r="2.2"/><path d="M9 8v6h6l2 6M9 14l-3 6M5 21h14"/>',
    dance: '<circle cx="12" cy="4.5" r="2.2"/><path d="M12 7v6M12 9l-5-3M12 9l5 2 2-3M12 13l-4 3 1 5M12 13l4 4-2 4"/>',
    cheer: '<circle cx="12" cy="7" r="2.2"/><path d="M12 9.5V16M12 11L7 4M12 11l5-7M12 16l-3 5M12 16l3 5"/>',
    bow: '<circle cx="16" cy="8" r="2.2"/><path d="M14 10l-6 2v4M8 12l1 9M8 16l5 5M10 11l3 4"/>',
    point: '<path d="M3 13h12"/><path d="M11 9l4 4-4 4"/><circle cx="19" cy="13" r="2"/>',
  };
  const emoteSvg = id => uiIconSvg(EMOTE_ICON[id] ? id : 'wave', 24) || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${EMOTE_ICON[id] || EMOTE_ICON.wave}</svg>`;      // 2026-10-14: the icon library's figures first
  let wheelDone = false;
  const useRadial = radial => { if (wheelDone || !radial?.addRing) return; wheelDone = true; radial.addRing({ title: 'Emotes', items: EMOTES.map(e => ({ id: 'emote:' + e.id, label: e.label, sub: e.cmd, html: emoteSvg(e.id) })), onPick: w => emote(String(w.id).replace(/^emote:/, '')) }); };
  useRadial(o.radial);

  function command(cmd, arg) {
    const c = String(cmd || '').replace(/^\//, '').toLowerCase();
    if (emoteFor(c)) return emote(c);
    if (c === 'emotes' || c === 'emote') { if (arg && emoteFor(arg)) return emote(arg); hud.chat?.(`Emotes: ${EMOTES.map(e => e.cmd).join('  ')}`, 'system'); return true; }
    if (c === 'changelog' || c === 'news' || c === 'whatsnew') { changelog.open(); return true; }
    if (c === 'track') { hud.chat?.(T.tracked.size ? `Tracking: ${[...T.tracked.values()].map(t => t.name).join(', ')}. Open the map (M) or your friends list to stop.` : 'You are not tracking anyone. Open the map (M) and use Track in the Party list, or Track in your friends list.', 'system'); return true; }
    return false;
  }

  function wire(n) {
    changelog.wire(n); classRes.wire(n);
    n.on('partyFrames', list => { if (!T.hold) T.frames = list || []; });
    n.on('party', p => {
      // someone who left the party is no longer tracked as a party member
      const ids = new Set((p?.members || []).map(m => String(m.char)));
      for (const [k, t] of T.tracked) if (t.kind === 'party' && !ids.has(k)) untrack(t.char, { quiet: true });
      changed();
    });
    n.on('whereabouts', m => { for (const r of m?.l || []) { const w = whereRow(r); if (w) T.where.set(String(w.char), w); } });
    n.on('trackR', r => {
      if (!r || r.ok !== false) return;
      const t = T.tracked.get(String(r.char));
      // a party member is still followed through the party's own frames: only a friend's refusal ends it
      if (t && t.kind !== 'party') { T.tracked.delete(String(r.char)); hud.toast(`${t.name}: ${trackRefusal(r)}`, 'warn'); changed(); }
    });
    n.on('emoteR', r => { if (r && r.ok === false) hud.toast(emoteRefusal(r), 'warn'); });
    // after a reconnect the server has forgotten who we follow: say it again
    n.on('joined', () => { for (const t of T.tracked.values()) { try { n.track?.(t.char); } catch { /* next time */ } } });
  }
  function tick() { if (T.tracked.size || arrowEls.size) drawArrows(); }

  const api = { changelog, classRes, useRadial, wire, tick, command, emote, EMOTES, people, track, untrack, spot,
    isTracked: char => T.tracked.has(String(char)),
    /** tests: party frames that the server's own 2 Hz rows do not overwrite (null = let them through again). */
    holdFrames(list) { T.hold = !!list; if (list) T.frames = list; changed(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** D-world: who the in-world arrow should point at (the first tracked person with a known spot). */
    tracking() { for (const t of T.tracked.values()) { const s = spot(t.char); if (s && Number.isFinite(s.x)) return { char: t.char, name: t.name, x: s.x, z: s.z, where: s.where }; } return null; },
    get state() { return { tracked: [...T.tracked.values()].map(t => ({ ...t, ...(spot(t.char) || {}) })), arrows: [...arrowEls.values()].map(e => e.textContent), changelog: changelog.state, people: people().map(p => ({ char: p.char, name: p.name, self: p.self, placed: p.placed, where: p.where, tracked: p.tracked })) }; } };
  worldMap?.setPeople?.({ list: people, track: (c, n) => track(c, n, 'party'), isTracked: api.isTracked, onChange: api.onChange });
  window.tvui10 = api;
  return api;
}
