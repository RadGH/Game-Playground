// What the owner reads to make the fair better (round 7, owner 2026-10-22: "players rate minigames after playing them …
// we can use that data later to weed out the unfun ones or prioritise the good ones", and "basic analytics, replace with
// GA later").
//
// Two stores, both under <data>/insights/:
//   YYYY-MM.jsonl          one line per thing that happened in a room: 'rate' (👍/👎 + reasons), 'played' (a minigame ran:
//                          how long, ended early, who dropped out), 'vote' (which minigames were offered, which won),
//                          'match', 'final'. Written by the rooms through hub `report`.
//   counts-YYYY-MM-DD.json the day's page counts: events (page views, host, join, find-a-game, editor, shop …), a few
//                          plain properties of them, and how many different visitors there were.
//
// No cookies and nothing stored on the visitor's device for this. A "visitor" is a hash of (address, browser, a random
// salt that is thrown away at midnight and never written down), so a day's visitors can be counted but nobody can be
// followed from one day to the next, and the address itself is never saved. That is the cookie-free kind of counting that
// needs no consent banner; if Google Analytics replaces it (js/client/tally.js has the hook), a banner WILL be needed.
// Read it all with tools/insights-report.mjs.
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, renameSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

export const TALLY = Object.freeze({ MAX_BYTES: 8 * 1024, MAX_EVENTS: 20, PER_HOUR: 400, NAME: /^[a-z][a-z0-9_]{1,31}$/, PROPS: 4, VALUE: 40 });

export function createInsights(dir, { now = () => Date.now(), build = 'dev' } = {}) {
  const folder = join(dir, 'insights'); mkdirSync(folder, { recursive: true });
  const day = () => new Date(now()).toISOString().slice(0, 10);
  let today = null, counts = null, seen = new Set(), salt = null, dirty = false;
  const file = d => join(folder, `counts-${d}.json`);
  function roll() {
    const d = day(); if (d === today) return;
    if (today) flush();
    today = d; seen = new Set(); salt = randomBytes(16);            // a new day: a new salt, so yesterday's visitors cannot be matched to today's
    try { counts = JSON.parse(readFileSync(file(d), 'utf8')); } catch { counts = { day: d, visitors: 0, events: {}, props: {} }; }
  }
  function flush() { if (!dirty || !counts) return; const f = file(today), tmp = f + '.tmp'; writeFileSync(tmp, JSON.stringify(counts, null, 1)); renameSync(tmp, f); dirty = false; }
  function count(name, props = null, who = null) {
    roll();
    counts.events[name] = (counts.events[name] || 0) + 1;
    if (props) for (const [k, v] of Object.entries(props)) { const key = `${name}|${k}=${v}`; counts.props[key] = (counts.props[key] || 0) + 1; }
    if (who && !seen.has(who)) { seen.add(who); counts.visitors++; }
    dirty = true;
  }
  /** A room's report (server side: always trusted). */
  function report(kind, data) {
    const rec = { at: new Date(now()).toISOString(), build, kind, ...data };
    try { appendFileSync(join(folder, `${rec.at.slice(0, 7)}.jsonl`), JSON.stringify(rec) + '\n'); } catch { /* disk full: never take a room down for this */ }
    count('room_' + kind, kind === 'played' || kind === 'rate' ? { game: data.game } : kind === 'match' ? { mode: data.mode } : null);
  }
  const recent = new Map();
  function take(ip, n) { const t = now(), list = (recent.get(ip) || []).filter(x => t - x < 3600e3); if (list.length + n > TALLY.PER_HOUR) return false; for (let i = 0; i < n; i++) list.push(t); recent.set(ip, list); return true; }
  /** POST /tally from a page: [{ e: 'page_view', p: { device: 'phone' } }, …]. Junk is dropped quietly. */
  function handle(req, ip, ua, done) {
    let size = 0, chunks = [], over = false;
    req.on('data', c => { size += c.length; if (size > TALLY.MAX_BYTES) { over = true; req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (over) return done(413);
      let list; try { list = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return done(400); }
      if (!Array.isArray(list)) list = [list];
      list = list.slice(0, TALLY.MAX_EVENTS).filter(x => x && typeof x.e === 'string' && TALLY.NAME.test(x.e));
      if (!list.length) return done(204);
      if (!take(ip, list.length)) return done(429);
      roll();
      const who = createHash('sha256').update(salt).update(String(ip)).update('\n').update(String(ua || '')).digest('hex').slice(0, 16);
      for (const x of list) {
        let props = null;
        if (x.p && typeof x.p === 'object') {
          props = {};
          for (const [k, v] of Object.entries(x.p).slice(0, TALLY.PROPS)) if (TALLY.NAME.test(k) && ['string', 'number', 'boolean'].includes(typeof v)) props[k] = String(v).replace(/[|=\n]/g, ' ').slice(0, TALLY.VALUE);
        }
        count(x.e, props, who);
      }
      done(204);
    });
  }
  roll();
  const timer = setInterval(flush, 30000); timer.unref?.();
  return { report, handle, count, flush, folder, get today() { roll(); return counts; } };
}

// ---- reading it back (the report tools and the admin feed, server/rgs.mjs) ----
/** The room reports of the last `days` days from an insights folder, oldest first. */
export function readInsightLines(folder, days = 30, now = Date.now()) {
  if (!existsSync(folder)) return [];
  const since = new Date(now - days * 864e5).toISOString();
  return readdirSync(folder).filter(f => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort()
    .flatMap(f => readFileSync(join(folder, f), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } })).filter(r => r && r.at >= since);
}
/** The last `days` daily page-count files, oldest first. */
export function readCounts(folder, days = 30) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder).filter(f => /^counts-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-days).map(f => { try { return JSON.parse(readFileSync(join(folder, f), 'utf8')); } catch { return null; } }).filter(Boolean);
}
/** Lower bound of the Wilson score interval (z = 1.645, 90%) on the share of thumbs up. 0 with no ratings. */
export const wilson = (up, n) => { if (!n) return 0; const z = 1.645, p = up / n; return (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n); };
