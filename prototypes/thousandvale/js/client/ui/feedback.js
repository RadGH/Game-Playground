// T19 (play-test 5): the Feedback window (the speech-bubble button on the menu bar, or /feedback, /bug, /suggest).
// Pick Suggestion or Bug report, write, send. A bug report also sends where you are, who you are playing and the last
// few lines of the client's log — and shows you exactly that under "What will be sent with it" before you press Send.
// Server: gateway `feedback {kind, text, ctx?}` -> `feedbackR {ok, id, first, msg}`; the first one per character is
// answered with a letter and a gift (T20) — the confirmation says to look in the mail.
//
// T21: an admin (joined.you.admin / the account's admin flag) also gets "Reports": every bug report and suggestion,
// filtered by kind and state, each with its context, and Approve / Decline / Trash. Server: gateway
// `admin {op:'reports', kind?, state?}` -> `adminReports {list}`; `admin {op:'report', id, state}` -> `adminR {ok, id, state}`.
//
// The log ring (pt5-core.js createLogRing, 40 lines) is fed by console.warn / console.error, uncaught errors, and the
// game's own warning and system lines. Nothing private goes in: no token, no password field, no e-mail.

import { createPanel, h, confirmBox } from '../ui-panel.js';
import { createLogRing, feedbackCheck, feedbackCtx, feedbackPreview, FEEDBACK_MAX } from './pt5-core.js';

export const LOG = createLogRing(40);
let hooked = false;
/** Start collecting (once, as early as the interface boots). */
export function installLogRing() {
  if (hooked) return LOG; hooked = true;
  const say = a => a.map(x => (x instanceof Error ? `${x.name}: ${x.message}` : typeof x === 'object' ? (() => { try { return JSON.stringify(x).slice(0, 200); } catch { return String(x); } })() : String(x))).join(' ');
  for (const k of ['warn', 'error']) {
    const orig = console[k].bind(console);
    console[k] = (...a) => { try { LOG.push(k, say(a)); } catch { /* never break logging */ } orig(...a); };
  }
  addEventListener('error', e => LOG.push('error', `${e.message || 'Error'}${e.filename ? ` (${String(e.filename).split('/').pop()}:${e.lineno || 0})` : ''}`));
  addEventListener('unhandledrejection', e => LOG.push('error', `Unhandled: ${e.reason?.message || e.reason || 'promise rejected'}`));
  return LOG;
}

const when = t => { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
const KIND = { bug: 'Bug report', suggestion: 'Suggestion' };
const STATE = { new: 'New', approved: 'Approved', declined: 'Declined', trash: 'Trash' };

export function createFeedback({ net, hud, context }) {
  installLogRing();
  const S = { kind: 'suggestion', text: '', sending: false, sent: null, timer: 0 };
  const panel = createPanel({ id: 'feedback', title: 'Feedback', width: 400, cls: 'feedback-panel', onOpen: () => draw() });
  const isAdmin = () => { const n = net(); return !!(n?.joined?.you?.admin || n?.account?.admin || n?.admin); };
  // A's helpers (net.feedback / net.adminOp pick the right socket); the raw gateway message on an older client
  const send = o => {
    const n = net(); if (!n || n.status === 'closed') return false;
    if (o.t === 'feedback' && typeof n.feedback === 'function') { n.feedback(o.kind, o.text, o.ctx); return true; }
    if (o.t === 'admin' && typeof n.adminOp === 'function') { const { t, op, ...a } = o; n.adminOp(op, a); return true; }
    if (!n._raw) return false; n._raw('gw', JSON.stringify(o)); return true;
  };
  const ctxNow = () => feedbackCtx(context?.() || {}, LOG.list());

  function draw() {
    if (!panel.isOpen) return;
    if (S.sent) return drawSent();
    panel.setTitle('Feedback', 'It goes straight to the people making the game');
    const ta = h('textarea', { maxLength: FEEDBACK_MAX, rows: 6, 'aria-label': 'Your feedback', placeholder: S.kind === 'bug' ? 'What happened, and what did you expect to happen? What were you doing just before?' : 'What would make the game better?' });
    ta.value = S.text;
    const count = h('small.count', {}, `${S.text.length}/${FEEDBACK_MAX}`);
    const note = h('p.note');
    const go = h('button.primary.small', { type: 'button', dataset: { act: 'send' }, onclick: () => submit() }, S.sending ? 'Sending…' : 'Send');
    go.disabled = S.sending;
    ta.addEventListener('input', () => { S.text = ta.value; count.textContent = `${S.text.length}/${FEEDBACK_MAX}`; note.textContent = ''; });
    const chip = (k, label) => h('button.chip', { type: 'button', role: 'radio', 'aria-checked': String(S.kind === k), dataset: { kind: k }, onclick: () => { S.kind = k; draw(); } }, label);
    let details = null;
    if (S.kind === 'bug') {
      const p = feedbackPreview(ctxNow());
      details = h('details.fb-ctx', {}, h('summary', {}, 'What will be sent with it'),
        h('p.tiny-left', {}, 'Only this, with your text. No password, no e-mail, nothing from outside the game.'),
        h('ul.fb-lines', {}, ...p.lines.map(l => h('li', {}, l))),
        h('span.label', {}, `The last ${p.log.length} log ${p.log.length === 1 ? 'line' : 'lines'}`),
        p.log.length ? h('ol.fb-log', {}, ...p.log.map(l => h('li', {}, l))) : h('p.tiny-left', {}, 'The log is empty — nothing has gone wrong that the game noticed.'));
    }
    panel.fill(
      h('div.chips.fb-kind', { role: 'radiogroup', 'aria-label': 'Kind of feedback' }, chip('suggestion', 'Suggestion'), chip('bug', 'Bug report')),
      ta, count, details, note,
      h('div.row.end', {}, isAdmin() ? h('button.ghost.small', { type: 'button', dataset: { act: 'reports' }, onclick: () => reports.panel.open() }, 'Reports (admin)') : null, h('span.grow'), h('button.ghost.small', { type: 'button', onclick: () => panel.close() }, 'Cancel'), go));
    function submit() {
      const c = feedbackCheck(S.kind, S.text);
      if (!c.ok) { note.textContent = c.why; ta.focus(); return; }
      const msg = { t: 'feedback', kind: S.kind, text: S.text.trim() };
      if (S.kind === 'bug') msg.ctx = ctxNow();
      if (!send(msg)) { note.textContent = 'You are not connected. Your text is still here — try again in a moment.'; return; }
      S.sending = true; go.disabled = true; go.textContent = 'Sending…';
      clearTimeout(S.timer);
      S.timer = setTimeout(() => { if (S.sending) { S.sending = false; draw(); panel.body.querySelector('.note').textContent = 'The server did not answer. Your text is still here — try Send again.'; } }, 8000);
    }
    if (!S.sending) ta.focus();
  }
  function drawSent() {
    const r = S.sent;
    panel.setTitle('Feedback', 'Sent');
    panel.fill(
      h('div.fb-done', {}, h('span.fb-tick', { 'aria-hidden': 'true' }, '✓'), h('strong', {}, r.kind === 'bug' ? 'Bug report sent. Thank you.' : 'Suggestion sent. Thank you.'),
        h('p', {}, r.msg || 'A person reads every one of these.'),
        r.first ? h('p.fb-gift', {}, 'A letter is on its way to you with a small thank-you inside. Look in your mail (Party menu, Mail).') : null,
        r.id != null ? h('p.tiny-left', {}, `Reference: #${r.id}`) : null),
      h('div.row.end', {}, h('button.ghost.small', { type: 'button', dataset: { act: 'again' }, onclick: () => { S.sent = null; draw(); } }, 'Write another'), h('span.grow'), h('button.primary.small', { type: 'button', onclick: () => { S.sent = null; panel.close(); } }, 'Close')));
  }

  // ---- T21: the admin's reports ----
  const R = { list: [], kind: '', state: 'new', open: null, loading: false, err: '' };
  const reports = { panel: createPanel({ id: 'reports', title: 'Reports', width: 560, cls: 'reports-panel', onOpen: () => { load(); drawReports(); } }) };
  function load() { R.loading = true; R.err = ''; if (!send({ t: 'admin', op: 'reports', ...(R.kind ? { kind: R.kind } : {}), ...(R.state ? { state: R.state } : {}) })) { R.loading = false; R.err = 'You are not connected.'; } setTimeout(() => { if (R.loading) { R.loading = false; R.err = 'The server did not answer.'; drawReports(); } }, 8000); }
  function setState(id, state) { send({ t: 'admin', op: 'report', id, state: state === 'trash' ? 'trashed' : state }); }   // protocol §21.9 says 'trashed'
  function drawReports() {
    const P = reports.panel; if (!P.isOpen) return;
    const sel = (k, opts, label) => h('label.rp-filter', {}, label, h('select', { dataset: { f: k }, onchange: e => { R[k] = e.target.value; R.open = null; load(); drawReports(); } }, ...opts.map(([v, t]) => h('option', { value: v, selected: R[k] === v }, t))));
    const filters = h('div.row.rp-filters', {}, sel('kind', [['', 'Everything'], ['bug', 'Bug reports'], ['suggestion', 'Suggestions']], 'Show '), sel('state', [['new', 'New'], ['approved', 'Approved'], ['declined', 'Declined'], ['trash', 'Trash'], ['', 'Any state']], ' that are '), h('span.grow'), h('button.ghost.small', { type: 'button', onclick: () => { load(); drawReports(); } }, 'Refresh'));
    const list = R.list.filter(r => (!R.kind || r.kind === R.kind) && (!R.state || (r.state || 'new') === R.state));
    P.setTitle('Reports', R.loading ? 'Loading…' : `${list.length} shown`);
    if (R.open != null) {
      const r = R.list.find(x => x.id === R.open);
      if (r) {
        const p = feedbackPreview(r.ctx || {});
        const act = (state, label, cls = 'ghost') => h(`button.${cls}.small`, { type: 'button', disabled: (r.state || 'new') === state, dataset: { set: state }, onclick: async () => { if (state === 'trash' && !(await confirmBox('Move this report to the trash?', { yes: 'Trash it', danger: true }))) return; setState(r.id, state); } }, label);
        P.fill(filters,
          h('div.rp-detail', {},
            h('div.rp-meta', {}, h('span.rp-kind.' + r.kind, {}, KIND[r.kind] || r.kind), h('span.rp-state.' + (r.state || 'new'), {}, STATE[r.state || 'new'] || r.state), h('span', {}, `#${r.id}`), h('span', {}, when(r.at)), h('span', {}, `${r.name || 'Someone'}${r.level ? `, level ${r.level}` : ''}`)),
            h('p.rp-text', {}, r.text || ''),
            p.lines.length ? h('ul.fb-lines', {}, ...p.lines.map(l => h('li', {}, l))) : null,
            p.log.length ? h('details', {}, h('summary', {}, `Log (${p.log.length})`), h('ol.fb-log', {}, ...p.log.map(l => h('li', {}, l)))) : null),
          h('div.row.end', {}, h('button.ghost.small', { type: 'button', onclick: () => { R.open = null; drawReports(); } }, '← List'), h('span.grow'), act('new', 'Back to new'), act('declined', 'Decline'), act('trash', 'Trash'), act('approved', 'Approve', 'primary')));
        return;
      }
      R.open = null;
    }
    P.fill(filters, R.err ? h('p.note', {}, R.err) : null,
      list.length ? h('ul.rp-list', {}, ...list.map(r => h('li.rp-row', { tabIndex: 0, dataset: { id: String(r.id) }, onclick: () => { R.open = r.id; drawReports(); }, onkeydown: e => { if (e.key === 'Enter') { R.open = r.id; drawReports(); } } },
        h('span.rp-kind.' + r.kind, {}, r.kind === 'bug' ? 'Bug' : 'Idea'), h('span.rp-line', {}, String(r.text || '').slice(0, 110)), h('span.rp-who', {}, `${r.name || '?'} · ${when(r.at)}`), h('span.rp-state.' + (r.state || 'new'), {}, STATE[r.state || 'new'] || r.state))))
        : h('p.empty', {}, R.loading ? 'Loading…' : 'Nothing here.'));
  }

  function wire(n) {
    n.on('feedbackR', r => {
      S.sending = false; clearTimeout(S.timer);
      if (!r.ok) { if (panel.isOpen) { draw(); const note = panel.body.querySelector('.note'); if (note) note.textContent = r.msg || ({ slow: 'You sent one a moment ago. Wait a little and press Send again — your text is still here.', empty: 'Write a little more.', size: 'That is too long.', kind: 'Pick Suggestion or Bug report.', rate: 'You have sent a lot just now. Try again in a few minutes.', short: 'Write a little more.', long: 'That is too long.' }[r.why]) || 'That did not go through. Your text is still here.'; } else hud.toast(r.msg || 'Your feedback did not go through.', 'warn'); return; }
      S.sent = { kind: S.kind, id: r.id ?? null, first: !!r.first, msg: r.msg || '' }; S.text = '';
      hud.chat?.(`Your ${S.kind === 'bug' ? 'bug report' : 'suggestion'} was sent. Thank you.`, 'system');
      if (panel.isOpen) draw(); else hud.toast('Feedback sent. Thank you.', 'good');
    });
    const tidy = r => ({ ...r, state: r.state === 'trashed' ? 'trash' : r.state || 'new', ctx: r.ctx || r.client || {}, level: r.level ?? r.server?.level ?? r.client?.level ?? null, name: r.name || r.server?.name || r.client?.name || '' });
    n.on('adminReports', m => { R.loading = false; R.err = ''; R.list = (m.list || m.reports || []).map(tidy); R.counts = m.counts || null; drawReports(); });
    n.on('adminR', r => {
      if (r.op === 'feedback' && Array.isArray(r.list)) { R.loading = false; R.err = ''; R.list = r.list.map(tidy); R.counts = r.counts || null; drawReports(); return; }
      if (r.ok === false && r.why === 'forbidden') { R.loading = false; R.err = 'This account is not an admin.'; drawReports(); return; }
      if (!r.ok) { R.loading = false; R.err = r.msg || 'That did not work.'; hud.toast(R.err, 'warn'); drawReports(); return; }
      if (r.state === 'trashed') r = { ...r, state: 'trash' };
      if (r.id != null) { R.list = R.list.map(x => (x.id === r.id ? { ...x, state: r.state || x.state } : x)); hud.toast(`Report #${r.id}: ${(STATE[r.state] || r.state || 'changed').toLowerCase()}.`, 'good'); if (R.state && r.state !== R.state) R.open = null; }
      drawReports();
    });
    n.on('joined', () => { if (panel.isOpen) draw(); });
  }
  return { panel, reports, wire, draw, open(kind) { if (kind) S.kind = kind; S.sent = null; panel.open(); draw(); }, isAdmin,
    get state() { return { open: panel.isOpen, kind: S.kind, sending: S.sending, sent: S.sent, log: LOG.size, admin: isAdmin(), reports: { open: reports.panel.isOpen, n: R.list.length, sel: R.open, kind: R.kind, state: R.state } }; } };
}
