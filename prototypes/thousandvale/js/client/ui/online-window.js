// Play-test 9 (X1, report S#51): the admin's "Online players" window — who is in the world right now, their level, class and
// where they are (the town, else the zone, "in a dungeon" inside one), with Refresh and a sort. Admin accounts only: the button
// sits beside "Reports" in the Feedback window, and `/online` opens it from chat.
// Server (A): `admin {op:'online'}` -> `adminOnline {ok, at, count, accounts, list:[{char, name, level, cls, clsName, where, …}]}`;
// anyone else gets `adminR {ok:false, why:'forbidden'}`. Rows and sorting: pt9-core.js (node-tested).
// (The message of the day is not a window: it is one system chat line the gateway sends when you enter the world.)

import { createPanel, h } from '../ui-panel.js';
import { onlineRows, onlineSummary, ONLINE_SORTS } from './pt9-core.js';

export function createOnlineWindow({ net, hud }) {
  const S = { m: null, sort: 'name', dir: 1, loading: false, err: '', timer: 0 };
  const panel = createPanel({ id: 'online', title: 'Online players', width: 460, cls: 'online-panel', onOpen: () => { load(); draw(); } });
  const isAdmin = () => { const n = net(); return !!(n?.joined?.you?.admin || n?.joined?.you?.acct?.admin || n?.account?.admin || n?.admin); };
  function load() {
    const n = net();
    S.loading = true; S.err = '';
    if (!n) { S.loading = false; S.err = 'You are not connected.'; return; }
    // A: always asked of the gateway, which knows every process (`net.adminOnline()`)
    if (typeof n.adminOnline === 'function') n.adminOnline(); else if (typeof n.adminOp === 'function') n.adminOp('online'); else n._raw?.('gw', JSON.stringify({ t: 'admin', op: 'online' }));
    clearTimeout(S.timer);
    S.timer = setTimeout(() => { if (S.loading) { S.loading = false; S.err = 'The server did not answer.'; draw(); } }, 8000);
  }
  const when = t => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
  function draw() {
    if (!panel.isOpen) return;
    const rows = onlineRows(S.m?.list, S.sort, S.dir);
    panel.setTitle('Online players', S.loading && !S.m ? 'Asking…' : S.m ? onlineSummary(S.m) : '');
    const head = (k, label) => h('th', { scope: 'col' }, h('button.linkish.on-sort' + (S.sort === k ? '.on' : ''), { type: 'button', dataset: { sort: k }, 'aria-pressed': String(S.sort === k),
      onclick: () => { if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = 1; } draw(); } }, label, S.sort === k ? (S.dir > 0 ? ' ▾' : ' ▴') : ''));
    panel.fill(
      S.err ? h('p.note', {}, S.err) : null,
      rows.length ? h('div.on-wrap', {}, h('table.on-table', {},
        h('thead', {}, h('tr', {}, ...ONLINE_SORTS.map(([k, l]) => head(k, l)))),
        h('tbody', {}, ...rows.map(r => h('tr', { dataset: { char: String(r.char ?? '') } },
          h('td.on-name', {}, r.name, r.admin ? h('small.on-tag', {}, 'admin') : null, r.account ? h('small.on-acct', {}, r.account) : null),
          h('td.on-level', {}, String(r.level)), h('td.on-where', {}, r.where), h('td.on-cls', {}, r.cls))))))
        : h('p.empty', {}, S.loading ? 'Asking the server…' : S.err ? '' : 'Nobody is in the world right now.'),
      h('div.row.end', {}, h('span.on-at', {}, S.m?.at ? `As of ${when(S.m.at)}` : ''), h('span.grow'),
        h('button.ghost.small', { type: 'button', dataset: { act: 'refresh' }, disabled: S.loading, onclick: () => { load(); draw(); } }, S.loading ? 'Asking…' : 'Refresh'),
        h('button.ghost.small', { type: 'button', onclick: () => panel.close() }, 'Close')));
  }
  function wire(n) {
    n.on('adminOnline', m => { S.loading = false; clearTimeout(S.timer); if (m.ok === false) { S.err = m.msg || 'That did not work.'; } else { S.err = ''; S.m = { ...m, at: m.at || Date.now() }; } draw(); });
    n.on('adminR', r => { if (S.loading && r.ok === false && (r.why === 'forbidden' || r.op === 'online')) { S.loading = false; clearTimeout(S.timer); S.err = r.why === 'forbidden' ? 'This account is not an admin.' : r.msg || 'That did not work.'; draw(); } });
  }
  return { panel, wire, draw, load, isAdmin,
    open() { if (!isAdmin()) { hud.toast('That window is for the game\'s keepers.', 'warn'); return false; } panel.open(); return true; },
    get state() { return { open: panel.isOpen, sort: S.sort, dir: S.dir, loading: S.loading, err: S.err, rows: onlineRows(S.m?.list, S.sort, S.dir), summary: S.m ? onlineSummary(S.m) : '' }; } };
}
