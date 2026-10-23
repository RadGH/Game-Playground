// Rad's Game Server (games.radgh.com) hooks for a game server: shared by Tumblefair and Knockabout (2026-10-23).
//
// 1. Accounts. A signed-in browser asks rgs-api for a one-time TICKET (shared/rgs-account.js `account.ticket(game)`)
//    and hands it to its own game server. The game server swaps it for the user with `POST <RGS_API>/auth/redeem`
//    (works once, lasts 2 minutes). That answer is the ONLY thing a game server believes about who someone is — a user
//    id sent by a browser is never trusted.
//      const redeem = createRedeemer({ game: 'tumblefair' });   const user = await redeem(ticket);   // user | null
//    null for a bad / used / expired ticket, a ticket made for another game, or rgs-api being down (logged; the
//    player carries on as a guest).
//
// 2. The admin feed. games.radgh.com/admin/ reads every game's bug reports, ratings and counts through
//      GET  /internal/admin/feed      -> { game, build, uptime_s, online, reports, ratings, insights, counts }
//      POST /internal/admin/action    { action: 'report', ids, state: 'done'|'declined'|'new', note } -> { ok, changed }
//    Both are switched on only when the env var RGS_ADMIN_SECRET is set (otherwise 404, as if they did not exist) and
//    need the header `x-rgs-admin: <secret>` (compared in constant time; a wrong one gets 403).
//
// Env vars: RGS_API (default https://games.radgh.com/api; on the droplet http://127.0.0.1:8600/api) and
// RGS_ADMIN_SECRET.
import { createHash, timingSafeEqual } from 'node:crypto';
import { listReports, markReports } from './feedback.mjs';
import { readInsightLines, readCounts, wilson } from './insights.mjs';
import { join } from 'node:path';

export const RGS_API_DEFAULT = 'https://games.radgh.com/api';
/** A user id we are willing to use as part of a profile key. rgs-api ids are uuids; anything odd is refused. */
export const cleanUserId = id => (typeof id === 'string' || typeof id === 'number') && /^[A-Za-z0-9_-]{1,64}$/.test(String(id)) ? String(id) : null;

/**
 * -> async redeem(ticket) -> { id, username, name, ... } | null. `fetchFn` and `api` are for tests.
 * `log(what, detail)` hears about every failure that is not simply a bad ticket.
 */
export function createRedeemer({ game, api = process.env.RGS_API || RGS_API_DEFAULT, fetchFn = globalThis.fetch, timeoutMs = 4000, log = () => {} } = {}) {
  const base = String(api).replace(/\/+$/, '');
  return async function redeem(ticket) {
    if (typeof ticket !== 'string' || !ticket || ticket.length > 256) return null;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchFn(base + '/auth/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket }), signal: ctl.signal });
      let j = null; try { j = await r.json(); } catch { /* not json */ }
      if (!r.ok) { if (j?.error?.code !== 'bad_ticket') log('rgs.redeem.fail', { status: r.status, code: j?.error?.code || null }); return null; }
      const u = j?.user, id = cleanUserId(u?.id);
      if (!id) { log('rgs.redeem.fail', { status: r.status, code: 'no_user' }); return null; }
      if (j.game && game && j.game !== game) { log('rgs.redeem.fail', { code: 'other_game', game: j.game }); return null; }
      return { ...u, id };
    } catch (e) {
      log('rgs.redeem.down', { msg: String(e?.message || e).slice(0, 160) });
      return null;
    } finally { clearTimeout(timer); }
  };
}

const same = (a, b) => { const x = createHash('sha256').update(String(a)).digest(), y = createHash('sha256').update(String(b)).digest(); return timingSafeEqual(x, y); };

/** Per-thing ratings from the insights log: the latest rating per voter wins (a change of mind replaces the earlier one). */
export function summarizeRatings(lines, { key = 'game', names = {} } = {}) {
  const G = new Map(), get = id => { if (!G.has(id)) G.set(id, { id, plays: 0, offered: 0, picked: 0, latest: new Map() }); return G.get(id); };
  let anon = 0;
  for (const r of lines) {
    if (r.kind === 'played' && r[key]) get(r[key]).plays++;
    else if (r.kind === 'vote') { for (const o of r.offered || []) if (o?.[key]) get(o[key]).offered++; if (r.pick) get(r.pick).picked++; }
    else if (r.kind === 'rate' && r[key]) get(r[key]).latest.set(r.voter ?? 'anon' + anon++, r);
  }
  return [...G.values()].map(g => {
    const rs = [...g.latest.values()], up = rs.filter(r => r.v > 0).length, down = rs.length - up, reasons = {};
    for (const r of rs) for (const k of r.why || []) { const w = (r.v > 0 ? '+' : '-') + k; reasons[w] = (reasons[w] || 0) + 1; }
    return { id: g.id, name: names[g.id] || g.id, up, down, plays: g.plays, score: Math.round(wilson(up, up + down) * 100), offered: g.offered, picked: g.picked, reasons };
  }).sort((a, b) => b.score - a.score || (b.up - b.down) - (a.up - a.down) || b.plays - a.plays);
}

/** The day-by-day page counts (newest last) and their totals. */
export function summarizeCounts(days) {
  const totals = { visitors: 0, events: {} };
  for (const d of days) { totals.visitors += d.visitors || 0; for (const [k, n] of Object.entries(d.events || {})) totals.events[k] = (totals.events[k] || 0) + n; }
  return { days: days.map(d => ({ day: d.day, visitors: d.visitors || 0, events: d.events || {} })), totals };
}

/**
 * The admin feed for one game server.
 *   createAdminFeed({ game, build, dataDir, online: () => ({ rooms, players }), ratingKey: 'game'|'arena', names })
 *   feed.handle(req, res, path) -> true when it answered the request
 * `secret` defaults to process.env.RGS_ADMIN_SECRET; empty = the routes do not exist.
 */
export function createAdminFeed({ game, build = 'dev', dataDir, online = () => ({ rooms: 0, players: 0 }), ratingKey = 'game', names = {}, secret = process.env.RGS_ADMIN_SECRET || '', started = Date.now(), days = 30, maxReports = 300, extra = () => ({}) }) {
  const feedbackDir = join(dataDir, 'feedback'), insightsDir = join(dataDir, 'insights');
  const nameOf = typeof names === 'function' ? names : () => names;
  function feed() {
    const reports = listReports(feedbackDir).slice(-maxReports).reverse().map(r => {
      const d = r.debug || {}, out = { id: r.id, at: r.at, state: r.state || 'new', kind: r.kind, text: r.text };
      const page = d.phase || d.screen?.name || (typeof d.screen === 'string' ? d.screen : null) || null;
      if (page) out.page = String(page).slice(0, 80);
      if (r.name) out.who = r.name;
      if (r.note) out.note = r.note;
      if (r.build) out.build = r.build;
      if (r.shot) out.shot = true;
      return out;
    });
    const lines = readInsightLines(insightsDir, days);
    const o = online() || {};
    return {
      game, build, uptime_s: Math.round((Date.now() - started) / 1000),
      online: { rooms: o.rooms || 0, players: o.players || 0 },
      reports,
      ratings: summarizeRatings(lines, { key: ratingKey, names: nameOf() }),
      insights: { days, matches: lines.filter(r => r.kind === 'match').length, finals: lines.filter(r => r.kind === 'final').length, played: lines.filter(r => r.kind === 'played').length, ratings: lines.filter(r => r.kind === 'rate').length },
      counts: summarizeCounts(readCounts(insightsDir, days)),
      ...extra(),
    };
  }
  function action(body) {
    if (body?.action !== 'report') return { code: 400, body: { ok: false, error: { code: 'bad_action' } } };
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 500) : [];
    const state = ['done', 'declined', 'new'].includes(body.state) ? body.state : null;
    if (!ids.length || !state) return { code: 400, body: { ok: false, error: { code: 'bad_request' } } };
    const changed = markReports(feedbackDir, ids, state, typeof body.note === 'string' ? body.note.slice(0, 2000) : '');
    return { code: 200, body: { ok: true, changed } };
  }
  const reply = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  function handle(req, res, path) {
    if (path !== '/internal/admin/feed' && path !== '/internal/admin/action') return false;
    if (!secret) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return true; }
    const given = req.headers['x-rgs-admin'];
    if (typeof given !== 'string' || !same(given, secret)) { reply(res, 403, { ok: false, error: { code: 'forbidden' } }); return true; }
    if (path === '/internal/admin/feed') {
      if (req.method !== 'GET') { reply(res, 405, { ok: false }); return true; }
      try { reply(res, 200, feed()); } catch (e) { reply(res, 500, { ok: false, error: { code: 'feed_failed', message: String(e?.message || e).slice(0, 200) } }); }
      return true;
    }
    if (req.method !== 'POST') { reply(res, 405, { ok: false }); return true; }
    let size = 0, chunks = [], over = false;
    req.on('data', c => { size += c.length; if (size > 64 * 1024) { over = true; req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (over) return reply(res, 413, { ok: false });
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply(res, 400, { ok: false, error: { code: 'bad_json' } }); }
      const r = action(body); reply(res, r.code, r.body);
    });
    return true;
  }
  return { handle, feed, action };
}
