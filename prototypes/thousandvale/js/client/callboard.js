// The Callboard (M3, protocol §16.6): the in-world group finder, from level 8. Pick a role (tank / healer / damage),
// pick a dungeon that fits your level (or "any"), wait in the queue (with how long you have waited), then a pop-up
// with the group and a 30-second countdown to Accept or Decline. When everyone accepts the server forms the party
// and moves you into the dungeon (a normal `joined` handoff, via 'callboard').
// Server: callboard {state: list|queued|pop|ready|formed|left}; refusals as err {code:'callboard', msg}. DOM only.

import { ROLES, defaultRole, mmss, popLeft, CALLBOARD_LEVEL } from './social-core.js';
import { createPanel, h } from './ui-panel.js';

export function createCallboard({ net: getNet, hud, me }) {
  const net = () => getNet();
  const S = { dungeons: [], minLevel: CALLBOARD_LEVEL, queued: null, role: null, pick: 'any', pop: null };
  const panel = createPanel({ id: 'callboard', title: 'The Callboard', width: 400, cls: 'cb-panel', onOpen: () => { net()?.callboard('list'); draw(); } });
  const popEl = h('div.cb-pop', { hidden: true, role: 'alertdialog', 'aria-label': 'Your group is ready' });
  (document.getElementById('hud') || document.body).appendChild(popEl);

  const role = () => S.role || (S.role = defaultRole(me().cls));
  function draw() {
    const pill = document.getElementById('menu-callboard');
    pill?.classList.toggle('queued', !!S.queued);
    if (!panel.isOpen) return;
    const lv = me().level || 1;
    panel.setTitle('The Callboard', S.queued ? 'In the queue' : 'Find a group');
    if (lv < S.minLevel) {
      panel.fill(h('p', {}, 'The Callboard pins up groups for dungeons across the realm: a tank, a healer and three to deal the damage.'),
        h('p.lock', {}, `It opens at level ${S.minLevel}. You are level ${lv}.`));
      return;
    }
    const roles = h('div.chips.cb-roles', { role: 'radiogroup', 'aria-label': 'Your role' }, ...ROLES.map(r => h('button.chip', { type: 'button', role: 'radio', 'aria-checked': String(role() === r.id), disabled: !!S.queued, onclick: () => { S.role = r.id; draw(); } }, r.label)));
    const rows = S.dungeons.map(d => h('li.cb-row' + (d.fits ? '' : '.nofit') + (S.pick === d.key ? '.on' : ''), { tabIndex: d.fits ? 0 : -1, onclick: () => { if (d.fits && !S.queued) { S.pick = d.key; draw(); } } },
      h('div.cb-main', {}, h('b', {}, d.name), h('small', {}, `Levels ${d.band ? d.band[0] + '–' + d.band[1] : d.level}`)),
      h('span.cb-wait', { title: 'People waiting for this one' }, waitText(d.waiting)),
      !d.fits ? h('span.cb-tag', {}, lv < (d.band?.[0] || 0) ? 'Too high' : 'Too low') : null));
    const queuedFor = S.queued ? (S.queued.dungeon === 'any' ? 'any dungeon that fits' : (S.dungeons.find(d => d.key === S.queued.dungeon)?.name || S.queued.dungeon)) : '';
    panel.fill(
      h('span.label', {}, 'Your role'), roles,
      h('div.row.cb-anyrow', {}, h('button.chip' + (S.pick === 'any' ? '.on' : ''), { type: 'button', 'aria-checked': String(S.pick === 'any'), disabled: !!S.queued, onclick: () => { S.pick = 'any'; draw(); } }, 'Any dungeon that fits me'), h('span.grow'), h('button.ghost.small', { type: 'button', onclick: () => net()?.callboard('list') }, 'Refresh')),
      rows.length ? h('ul.cb-list', {}, rows) : h('p.empty', {}, 'No dungeons pinned on the board yet.'),
      S.queued
        ? h('div.cb-queued', {}, h('p', {}, h('b', {}, `Waiting as ${ROLES.find(r => r.id === S.queued.role)?.label || 'Damage'}`), ` for ${queuedFor}`, S.queued.with > 1 ? ` with your party of ${S.queued.with}` : '', '.'), h('p.cb-time', { dataset: { since: S.queued.localSince || Date.now() } }, ''), h('button.ghost', { type: 'button', onclick: () => net()?.callboard('leave') }, 'Leave the queue'))
        : h('button.primary', { type: 'button', onclick: () => net()?.callboard('join', { dungeon: S.pick || 'any', role: role() }) }, 'Join the queue'),
      h('p.tiny-left', {}, 'A party is queued by its leader. If a group is short after five minutes, hired followers fill the empty places.'));
    tick();
  }
  const waitText = w => { if (!w) return ''; const parts = []; if (w.tank) parts.push(`${w.tank}T`); if (w.healer) parts.push(`${w.healer}H`); if (w.dps) parts.push(`${w.dps}D`); return parts.join(' '); };

  function showPop(p) {
    S.pop = { ...p, until: performance.now() + (p.ms || 30000), answered: false, ready: [] };
    drawPop();
    hud.toast('Your group is ready!', 'good');
    hud.chat(`The Callboard found a group for ${p.dungeon?.name || 'a dungeon'}. Accept within ${Math.round((p.ms || 30000) / 1000)} seconds.`, 'system');
  }
  function drawPop() {
    const p = S.pop; if (!p) { popEl.hidden = true; return; }
    popEl.replaceChildren(
      h('h3', {}, 'Your group is ready'),
      h('p.cb-dname', {}, p.dungeon?.name || 'A dungeon', p.dungeon?.band ? h('small', {}, ` · levels ${p.dungeon.band[0]}–${p.dungeon.band[1]}`) : null),
      h('ul.cb-members', {}, ...(p.members || []).map(m => h('li' + (p.ready.includes(m.char) ? '.ready' : ''), {}, h('span.cb-role.r-' + (m.role || 'dps'), {}, (ROLES.find(r => r.id === m.role)?.label || 'Damage')), ` ${m.name}`, h('small', {}, ` ${m.level}`), p.ready.includes(m.char) ? h('i.tick', { title: 'Ready' }, '✓') : null)),
        ...Array.from({ length: p.backfill || 0 }, () => h('li.hired', {}, h('span.cb-role', {}, 'Hired'), ' A follower fills this place'))),
      h('div.cb-bar', {}, h('i')),
      h('div.row', {},
        h('button.ghost', { type: 'button', disabled: p.answered, onclick: () => answer(false) }, 'Decline'),
        h('button.primary', { type: 'button', disabled: p.answered, onclick: () => answer(true) }, p.answered ? 'Waiting for the others…' : 'Accept')));
    popEl.hidden = false;
    tick();
  }
  function answer(yes) {
    const p = S.pop; if (!p || p.answered) return;
    net()?.callboard(yes ? 'accept' : 'decline', { id: p.id });
    if (yes) { p.answered = true; drawPop(); } else { S.pop = null; popEl.hidden = true; }
  }
  function tick() {
    const t = panel.root.querySelector('.cb-time');
    if (t) t.textContent = `Waiting ${mmss(Date.now() - (+t.dataset.since || Date.now()))}`;
    if (S.pop) {
      const left = popLeft(S.pop, performance.now());
      const bar = popEl.querySelector('.cb-bar i'); if (bar) bar.style.width = (left * 100).toFixed(1) + '%';
      if (left <= 0 && !S.pop.answered) { S.pop = null; popEl.hidden = true; }
    }
  }
  setInterval(tick, 250);

  function wire(n) {
    n.on('callboard', m => {
      switch (m.state) {
        case 'list': S.dungeons = m.dungeons || []; S.minLevel = m.minLevel || S.minLevel; S.queued = m.queued ? { ...m.queued, localSince: S.queued?.localSince || Date.now() } : null; if (S.pick !== 'any' && !S.dungeons.some(d => d.key === S.pick && d.fits)) S.pick = 'any'; break;
        case 'queued': S.queued = { dungeon: m.dungeon, since: m.since, role: m.role, with: m.with, localSince: S.queued?.localSince || Date.now() };   // `since` is the server's sim clock, not wall time
          if (m.again) { S.pop = null; popEl.hidden = true; hud.toast('Someone declined — you keep your place in the queue.', 'info'); }
          else hud.toast('You are in the Callboard queue.', 'good');
          break;
        case 'pop': showPop(m); break;
        case 'ready': if (S.pop && S.pop.id === m.id) { S.pop.ready = m.ready || []; drawPop(); } break;
        case 'formed': S.queued = null; S.pop = null; popEl.hidden = true; hud.toast(`Group formed — into ${m.dungeon?.name || 'the dungeon'}!`, 'good'); panel.close(); break;
        case 'left': S.queued = null; S.pop = null; popEl.hidden = true;
          hud.toast(m.why === 'declined' || m.why === 'decline' ? 'You left the queue.' : m.why === 'timeout' ? 'You did not answer in time — you left the queue.' : m.why === 'partner' ? 'Your party left the queue.' : 'You are out of the Callboard queue.', 'info');
          break;
      }
      draw();
    });
    n.on('err', e => { if (e.code === 'callboard') hud.toast(e.msg || 'The Callboard cannot do that.', 'warn'); });
  }

  return { wire, panel, draw, get state() { return S; } };
}
