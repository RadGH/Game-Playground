// SYSTEM MAIL (stream A, play-test 5 T20): ONE call any system uses to post a letter with items, gold or a gift box —
// the thank-you for a first feedback report, an event share for someone who had already left, anything later. Pure.
//
//   const sysmail = createSystemMail({ store, newUid, wallNow, notify, log })
//   await sysmail.mailTo({ to, subject, body, from?, items?, gold?, gift?, crate?, keepMs? }) -> { ok, id, to } | { ok:false, why }
//     to       a character id, or a character NAME (looked up, offline ones too)
//     items    item objects (copied; each gets a fresh server uid — the same item can never be in two letters)
//     gift     { minRarity?, level?, name? }   adds a Gift Box that opens into an item of that rarity or better (crates.js)
//     crate    { slot, min, … }                 adds a crate (the T9 one)
//     from     the sender shown on the letter (default 'The Vale')
//     keepMs   how long the post keeps it (default: for ever — system letters are never destroyed while they hold something)
// The letter is `kind: 'system'`: it can be read and its attachments taken ANYWHERE (js/sim/mail.js), and it cannot be
// returned. `notify(charId)` tells the gateway so an online player hears `mailNew` at once.

import { giftBox, crateItem } from './crates.js';

export const SYSMAIL = Object.freeze({ subjectMax: 60, bodyMax: 1000, items: 8 });

export function createSystemMail({ store, newUid, wallNow = () => Date.now(), notify = () => {}, log = () => {}, counters = {} }) {
  const clean = (t, n) => String(t || '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').slice(0, n);
  async function mailTo({ to, subject = '', body = '', from = 'The Vale', items = [], gold = 0, gift = null, crate = null, keepMs = null } = {}) {
    if (!store || !store.mailSystem) return { ok: false, why: 'noPost' };
    let charId = to;
    if (typeof to === 'string' && !/^\d+$/.test(to)) {
      const c = store.charByName ? await store.charByName(to) : null;
      if (!c) return { ok: false, why: 'notFound' };
      charId = c.id;
    }
    charId = +charId;
    if (!Number.isSafeInteger(charId)) return { ok: false, why: 'notFound' };
    const list = [];
    for (const it of [...(items || []), ...(gift ? [giftBox(gift)] : []), ...(crate ? [crateItem(crate)] : [])].slice(0, SYSMAIL.items)) {
      if (!it || typeof it !== 'object') continue;
      const item = JSON.parse(JSON.stringify(it)); delete item._granted;
      if (item.uid) item.ruid = item.uid;
      item.uid = newUid();
      list.push(item);
    }
    const t = wallNow();
    let r = false;
    try { r = await store.mailSystem({ to: charId, fromName: clean(from, 24) || 'The Vale', subject: clean(subject, SYSMAIL.subjectMax), body: clean(body, SYSMAIL.bodyMax), gold: Math.max(0, Math.round(gold) || 0), items: list, sentAt: t, expiresAt: keepMs ? t + keepMs : null }); }
    catch (err) { log('system mail failed', err && err.message); r = false; }
    if (!r) { counters.sysmailFails = (counters.sysmailFails || 0) + 1; return { ok: false, why: 'failed' }; }
    counters.sysmail = (counters.sysmail || 0) + 1;
    try { notify(charId); } catch { /* the letter is in the post either way */ }
    return { ok: true, id: r.id, to: charId, items: list.length };
  }
  return { mailTo };
}
