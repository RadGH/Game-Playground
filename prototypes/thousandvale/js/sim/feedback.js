// FEEDBACK (stream A, play-test 5: T19 "a feedback button — suggestion or bug report; a bug report attaches location,
// character info, basic logs", T20 the thank-you letter, T21 admins review them). Pure.
//
//   const F = createFeedback({ store, wallNow, sink, sysmail, log, counters, filter })
//   await F.submit({ account, char, name, cls, level }, { kind, text, ctx }, server) -> feedbackR body
//       server = the server's own context (room, zone, position, hp, …) — whatever the caller knows
//   await F.listMine({ account }, { limit, before }) -> feedbackList body: the caller's OWN reports (W29)
//   await F.adminOp({ admin: bool, by: 'name' }, { op, id, state, kind, limit, before, note }) -> { t, … } to send
//   sanitize(ctx) -> a clean, capped copy of what the client sent        FEEDBACK limits below
//
// STORED in the store (`addFeedback` — Postgres table `feedback`, or the memory store) AND handed to `sink(row)`: the
// server appends every report (and every state change) to `.data/feedback-<env>.jsonl`, so tools/feedback-report.mjs can
// read reports from a server that keeps nothing else on disk.
// LIMITS: one report per `gapMs` (2 s) and `perHour` (1000 — play-test 6 U2: the owner files them while play-testing) per account; text <= 2000 chars; the client context <= 6 kB of JSON.

import { FEEDBACK_KINDS, FEEDBACK_STATES } from '../net/protocol.js';
import { economy } from './economy-knobs.js';

export const FEEDBACK = Object.freeze({ textMax: 2000, ctxMax: 6000, logLines: 60, logLine: 300, depth: 4, keys: 40, str: 500, gapMs: 2000, perHour: 1000, list: 100, mine: 50 });
export const THANKS = Object.freeze({
  subject: 'Thank you',
  body: 'Thank you for taking the time to improve the game. Every report is read.\n\nThere is a small gift with this letter — open it from your bag.',
  from: 'The Vale',
});

const strip = (s, n) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, '').slice(0, n);

/** A clean copy of the client's context: plain JSON only, no deep nesting, no huge strings, logs capped. */
export function sanitize(ctx, L = FEEDBACK) {
  const walk = (v, d, key) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') return strip(v, key === 'logs' || key === 'log' ? L.logLine : L.str);
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null;
    if (typeof v === 'boolean') return v;
    if (d >= L.depth) return null;
    if (Array.isArray(v)) { const isLog = key === 'logs' || key === 'log'; return (isLog ? v.slice(-L.logLines) : v.slice(0, 30)).map(x => walk(x, d + 1, key)).filter(x => x !== null); }
    if (typeof v === 'object') {
      const out = {};
      let n = 0;
      for (const [k, x] of Object.entries(v)) {
        if (n++ >= L.keys) break;
        const kk = strip(k, 40).replace(/[^\w.\-]/g, '_');
        if (!kk || kk === '__proto__' || kk === 'constructor' || kk === 'prototype') continue;
        const w = walk(x, d + 1, kk);
        if (w !== null) out[kk] = w;
      }
      return out;
    }
    return null;
  };
  let out = walk(ctx && typeof ctx === 'object' && !Array.isArray(ctx) ? ctx : {}, 0, '') || {};
  if (out.log && !out.logs) { out.logs = out.log; delete out.log; }
  // still too big: drop the oldest log lines, then everything but the basics
  let json = JSON.stringify(out);
  while (json.length > L.ctxMax && Array.isArray(out.logs) && out.logs.length) { out.logs.splice(0, Math.max(1, Math.ceil(out.logs.length / 4))); json = JSON.stringify(out); }
  if (json.length > L.ctxMax) { const keep = {}; for (const k of ['where', 'char', 'name', 'cls', 'level', 'zone', 'room', 'x', 'z', 'build', 'ua']) if (out[k] !== undefined) keep[k] = out[k]; out = JSON.stringify(keep).length <= L.ctxMax ? keep : {}; out.trimmed = true; }
  return out;
}

/** Owner feedback 7, V1: the letter a character gets ONCE at level 3 when it has never sent feedback. */
export const NUDGE = Object.freeze({
  level: 3, subject: 'Share your thoughts', from: 'The Vale',
  body: 'Help us make the game better by submitting feedback. Earn a free item as a reward the first time you share feedback or submit a bug.\n\nThe Feedback button is on the menu bar.',
});

export const cleanState = s => { const v = String(s || '').toLowerCase(); return v === 'trash' ? 'trashed' : FEEDBACK_STATES.includes(v) ? v : null; };

export function createFeedback({ env: envName = null, store, wallNow = () => Date.now(), sink = null, sysmail = null, log = () => {}, counters = {}, filter = null, opts = {} }) {
  const R = { ...FEEDBACK, ...opts };
  const sent = new Map();          // account -> [wall ms]
  const view = r => ({ id: r.id, at: r.at, kind: r.kind, text: r.text, state: r.state === 'trashed' ? 'trashed' : r.state, account: r.account ?? null, char: r.char ?? null, name: r.name || null, cls: r.cls || null, level: r.level || null,
    client: r.client || {}, ctx: r.client || {}, server: r.server || {}, env: (r.server && r.server.env) || envName || null, note: r.note || '', stateAt: r.stateAt || null, stateBy: r.stateBy || null, done: r.done || '', doneAt: r.doneAt || null, ref: r.ref ?? null });
  /** What the SENDER of a report may see of it (W29): no server context, no account, and a trashed report reads `closed`. */
  const mine = r => { const fin = r.state === 'completed'; return { id: r.id, at: r.at, kind: r.kind, text: r.text, name: r.name || null, state: r.state === 'trashed' ? 'closed' : r.state,
    note: fin ? (r.done || '') : (r.note || ''), noteAt: fin ? (r.doneAt || r.stateAt || null) : (r.note ? r.stateAt || null : null), adminNote: r.note || '', done: r.done || '', doneAt: r.doneAt || null, ref: r.ref ?? null }; };

  async function submit(who, m, server = {}) {
    const kind = String(m.kind || '').toLowerCase();
    if (!FEEDBACK_KINDS.includes(kind)) return { ok: false, why: 'kind', msg: 'Choose Suggestion or Bug report.' };
    const text = strip(m.text || '', R.textMax).replace(/[ \t]+\n/g, '\n').trim();
    if (text.length < 3) return { ok: false, why: 'empty', msg: 'Write a few words first.' };
    if (!store || !store.addFeedback) return { ok: false, why: 'state', msg: 'Feedback is not open on this server.' };
    const t = wallNow(), key = who.account ?? 'x';
    const recent = (sent.get(key) || []).filter(x => x > t - 3600000);
    if (recent.length && t - recent[recent.length - 1] < R.gapMs) return { ok: false, why: 'slow', msg: 'One at a time: wait a few seconds and send it again.', wait: R.gapMs - (t - recent[recent.length - 1]) };
    if (recent.length >= R.perHour) return { ok: false, why: 'slow', msg: 'That is a lot of reports this hour. Thank you — please send the rest later.' };
    // W29: a reply is a NEW report that names one of the sender's own earlier reports; its text starts with the reference
    let ref = null, body = text;
    if (m.ref != null) {
      const old = Number.isSafeInteger(m.ref) && store.getFeedback ? await store.getFeedback(m.ref) : null;
      if (!old || old.account == null || old.account !== who.account) return { ok: false, why: 'ref', msg: 'You can only reply to a report of your own.' };
      ref = old.id;
      if (!new RegExp('^#' + ref + '\\b').test(body)) body = strip('#' + ref + ' ' + body, R.textMax);
    }
    // W7: a report posted by an admin is approved as it arrives
    let auto = false;
    if (who.account != null && store.isAdmin) { try { auto = !!(await store.isAdmin(who.account)); } catch { auto = false; } }
    recent.push(t); sent.set(key, recent);
    const row = { at: t, kind, text: body, ref, ...(auto ? { stateBy: 'admin (own report)', stateAt: t } : {}), account: who.account ?? null, char: who.char ?? null, name: who.name || null, cls: who.cls || null, level: who.level || null, client: sanitize(m.ctx, R), server: sanitize(server, { ...R, ctxMax: 4000 }), state: auto ? 'approved' : 'new' };
    let res;
    try { res = await store.addFeedback(row); } catch (err) { log('feedback store failed', err && err.message); res = null; }
    if (!res) { recent.pop(); return { ok: false, why: 'failed', msg: 'That did not go through. Please try again.' }; }
    row.id = res.id;
    counters.feedback = (counters.feedback || 0) + 1;
    if (sink) { try { sink({ ev: 'new', ...row }); } catch (err) { log('feedback sink failed', err && err.message); } }
    // T20: the first report of each CHARACTER brings a thank-you letter with a gift box (a rare item or better)
    let first = false;
    if (res.first && who.char != null && sysmail) {
      const r = await sysmail.mailTo({ to: who.char, subject: THANKS.subject, body: THANKS.body, from: THANKS.from, gift: { minRarity: economy().gift.feedbackMinRarity, level: who.level || 1 } });
      first = !!(r && r.ok);
      if (first) counters.feedbackGifts = (counters.feedbackGifts || 0) + 1;
      else if (store.feedbackGiftFailed) { try { await store.feedbackGiftFailed(who.char); } catch { /* next time */ } }
    }
    return { ok: true, id: row.id, first, state: row.state, ...(ref != null ? { ref } : {}), msg: first ? 'Thank you! There is a letter for you in the post.' : 'Thank you! Your ' + (kind === 'bug' ? 'bug report' : 'suggestion') + ' was sent.' };
  }

  /** W29: the caller's OWN reports, newest first -> a `feedbackList` body. Asked by account, so every character of it sees the same list. */
  async function listMine(who, m = {}) {
    if (!who || who.account == null || !store || !store.listFeedback) return { t: 'feedbackMine', ok: false, why: 'state', list: [], more: false, msg: 'Feedback is not open on this server.' };
    if (!who.claimed) return { t: 'feedbackMine', ok: false, why: 'guest', list: [], more: false, msg: 'Sign in to follow your reports.' };
    const limit = Math.max(1, Math.min(R.mine, m.limit || R.mine));
    const rows = await store.listFeedback({ account: who.account, limit: limit + 1, before: Number.isSafeInteger(m.before) ? m.before : null });
    return { t: 'feedbackMine', ok: true, list: rows.slice(0, limit).map(mine), more: rows.length > limit };
  }

  /** The admin's view (T21). `who.admin` must be true — checked by the caller's socket, and again here. */
  async function adminOp(who, m) {
    const op = m.op === 'feedback' ? 'reports' : m.op === 'state' ? 'report' : m.op;
    if (!who || !who.admin) return { t: 'adminR', op: m.op, ok: false, why: 'forbidden', msg: 'Admins only.' };
    if (!store || !store.listFeedback) return { t: 'adminR', op: m.op, ok: false, why: 'state', msg: 'Not on this server.' };
    if (op === 'reports') {
      const state = m.state ? cleanState(m.state) : null;
      const kind = m.kind && FEEDBACK_KINDS.includes(m.kind) ? m.kind : null;
      const rows = await store.listFeedback({ state, kind, limit: Math.max(1, Math.min(R.list, m.limit || R.list)), before: m.before || null, hideTrashed: !state });
      const counts = await store.feedbackCounts();
      return { t: 'adminReports', op: m.op, ok: true, list: rows.map(view), counts };
    }
    if (op === 'report') {
      const state = cleanState(m.state);
      if (!state || !Number.isSafeInteger(m.id)) return { t: 'adminR', op: m.op, ok: false, why: 'state', msg: 'Pick new, approved, declined, completed or trashed.' };
      // W28: on `completed` the note is the CHANGELOG line the sender reads ("how it was fixed"), stored apart from the admin's own note
      const text = m.note != null ? strip(m.note, 500) : null;
      const done = state === 'completed' ? (text ?? '') : null, note = state === 'completed' ? null : text;
      const ok = await store.setFeedbackState(m.id, state, { by: who.by || 'admin', at: wallNow(), note, done });
      if (!ok) return { t: 'adminR', op: m.op, ok: false, id: m.id, why: 'missing', msg: 'No such report.' };
      if (sink) { try { sink({ ev: 'state', id: m.id, state, by: who.by || 'admin', at: wallNow(), ...(note != null ? { note } : {}), ...(done != null ? { done } : {}) }); } catch { /* the store has it */ } }
      return { t: 'adminR', op: m.op, ok: true, id: m.id, state, ...(done != null ? { done } : {}), counts: await store.feedbackCounts() };
    }
    return { t: 'adminR', op: m.op, ok: false, why: 'op', msg: 'Unknown admin call.' };
  }
  void filter;
  return { submit, adminOp, listMine, view, mine, R };
}
