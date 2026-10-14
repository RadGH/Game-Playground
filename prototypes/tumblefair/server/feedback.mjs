// Bug reports and suggestions from players (the "!" button in the game). POST /feedback with JSON:
//   { kind: 'bug'|'idea', text, name?, debug: {…}, shot?: 'data:image/jpeg;base64,…' }
// Saved as <data>/feedback/<id>.json (+ <id>.jpg) — one file each, never overwritten. Read them with
// tools/feedback-report.mjs. Limits: 1.5 MB a request, 12 reports an hour per address, text 4000 characters.
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const FEEDBACK = Object.freeze({ MAX_BYTES: 1.5 * 1024 * 1024, PER_HOUR: 12, TEXT: 4000, DEBUG: 24000 });

export function createFeedback(dir, { now = () => Date.now(), build = 'dev' } = {}) {
  const folder = join(dir, 'feedback'); mkdirSync(folder, { recursive: true });
  let next = readdirSync(folder).filter(f => f.endsWith('.json')).reduce((n, f) => Math.max(n, parseInt(f, 10) || 0), 0) + 1;
  const recent = new Map();     // ip -> [times]
  function take(ip) { const t = now(), list = (recent.get(ip) || []).filter(x => t - x < 3600e3); if (list.length >= FEEDBACK.PER_HOUR) return false; list.push(t); recent.set(ip, list); return true; }
  /** -> { status, body } */
  function handle(req, ip, done) {
    let size = 0, chunks = [], over = false;
    req.on('data', c => { size += c.length; if (size > FEEDBACK.MAX_BYTES) { over = true; req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (over) return done(413, { ok: false, msg: 'That report is too big.' });
      if (!take(ip)) return done(429, { ok: false, msg: 'Thanks! That is a lot of reports for one hour — try again later.' });
      let m; try { m = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return done(400, { ok: false, msg: 'Could not read that report.' }); }
      const text = String(m?.text || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, FEEDBACK.TEXT);
      if (!text) return done(400, { ok: false, msg: 'Please write what happened.' });
      let debug = m.debug && typeof m.debug === 'object' ? m.debug : {};
      if (JSON.stringify(debug).length > FEEDBACK.DEBUG) debug = { cut: true, partial: JSON.stringify(debug).slice(0, FEEDBACK.DEBUG) };
      const id = next++, rec = { id, at: new Date(now()).toISOString(), build, ip, kind: m.kind === 'idea' ? 'idea' : 'bug', name: String(m.name || '').slice(0, 32), text, debug, state: 'new' };
      const shot = typeof m.shot === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(m.shot) ? m.shot : null;
      if (shot) { const ext = shot.slice(11, shot.indexOf(';')).replace('jpeg', 'jpg'); writeFileSync(join(folder, `${id}.${ext}`), Buffer.from(shot.slice(shot.indexOf(',') + 1), 'base64')); rec.shot = `${id}.${ext}`; }
      writeFileSync(join(folder, `${id}.json`), JSON.stringify(rec, null, 1));
      done(200, { ok: true, id });
    });
  }
  return { handle, folder };
}
