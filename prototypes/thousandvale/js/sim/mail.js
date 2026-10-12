// MAIL (stream A, PLAN §9.2 / §13 / §15 M3), run by the PROVINCE PROCESS that holds the character — because the
// pack and the gold live in the character's blob, and a letter with items or gold must leave the blob and land in
// escrow in ONE transaction (store.mailSend), exactly like a trade: either everything moves or nothing does.
// Taking the attachments is the same in reverse (store.mailTake). An item in escrow is a row in `items` keyed by
// its uid, so the same item can never be in two letters.
//
//   list / read     anywhere                send / take   in a town (the post is in town), not while trading
//                   (a SYSTEM letter — js/sim/sysmail.js: gifts, event shares — is taken anywhere; play-test 5 T20)
//   send            a claimed account at level 5+ (PLAN §5.5), up to MAIL.items items + gold, POSTAGE gold (a sink)
//                   to any character by name (your own other characters too) who is not ignoring you
//   return          send an untaken letter back to whoever sent it; letters left 30 days go back on their own
//                   (returned letters keep until taken — items are never destroyed by the post)
//   delete          only once nothing is left in it
// The recipient hears `mailNew {unread}` from the gateway (bus `mailed`), online or at their next login.
//
//   const M = createMail({ store, online, journal, syncChar, econ, trades, send, setTimeoutTicks, wallNow, filter, log, counters, BAG_MAX })
//   M.op(o, m)          o = the province's online record; m = mail {op, ...}

import { MAIL_OPS } from '../net/protocol.js';
import { economy } from './economy-knobs.js';

export const MAIL = Object.freeze({ items: 6, postage: 1, minLevel: 5, expireMs: 30 * 86400000, perHour: 20, subjectMax: 60, bodyMax: 500, list: 50 });

export function createMail({ store, online, journal, syncChar, econ, trades, send = () => {}, setTimeoutTicks, wallNow, filter = null, log = () => {}, counters = {}, BAG_MAX = 120, saveNow = () => {}, restack = () => {}, opts = {} }) {
  /** U1 (play-test 6): the unread count the badge shows, re-sent after anything that can change it (read, take, delete). */
  const tellUnread = o => store.mailUnread(o.char.id).then(n => { if (o.conn) o.conn.sendJSON({ t: 'mailNew', unread: n }); }, () => {});
  const R = { ...MAIL, postage: economy().mail.postage, ...opts };          // V2: postage from data/rules/economy.json server.mail
  const sentLog = new Map();      // char -> [wall ms] (spam limit)
  const clean = (t, n) => { const s = String(t || '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').slice(0, n); return filter ? filter.text(s) : s; };
  const reply = (o, op, x) => { if (o.conn) o.conn.sendJSON({ t: 'mailR', op, ...x }); };
  const fail = (o, op, why, msg) => reply(o, op, { ok: false, why, msg });
  const inTown = o => o.room.kind === 'town';
  const busy = o => o.frozen || o.saving || o.mailBusy;

  async function list(o) {
    const [mail, unread] = await Promise.all([store.mailList(o.char.id, R.list), store.mailUnread(o.char.id)]);
    if (o.conn) o.conn.sendJSON({ t: 'mailList', mail, unread });
  }

  async function sendMail(o, m) {
    const ch = o.char, op = 'send';
    // W11 (round 8, report #32): a character on a claimed account IS linked — and the level is the account's (its highest
    // character, o.alv), so a new alt of an established account posts letters from its first minute
    if (!o.claimed) return fail(o, op, 'gate', 'Sending mail needs a claimed account. Claim yours from the Account button — it is free.');
    if (Math.max(ch.level || 1, o.alv || 1) < R.minLevel) return fail(o, op, 'level', 'Sending mail opens when one of your characters reaches level ' + R.minLevel + '.');
    if (!inTown(o)) return fail(o, op, 'town', 'Post letters in a town.');
    if (busy(o)) return fail(o, op, 'busy', 'Busy, try again in a moment.');
    const uids = m.items || [], gold = m.gold || 0;
    if (uids.length > R.items) return fail(o, op, 'items', 'A letter carries at most ' + R.items + ' items.');
    if (new Set(uids).size !== uids.length) return fail(o, op, 'items', 'The same item twice?');
    if (!Number.isSafeInteger(gold) || gold < 0) return fail(o, op, 'gold', 'That is not an amount of gold.');
    const cost = gold + R.postage;
    if (cost > (ch.gold || 0)) return fail(o, op, 'gold', 'You need ' + cost + ' gold (' + R.postage + ' for the postage).');
    const bag = ch.bag || [];
    const items = uids.map(u => bag.find(i => i.uid === u));
    if (items.some(x => !x)) return fail(o, op, 'item', 'You do not have that item.');
    if (uids.some(u => trades.offered(ch.id, u)) || trades.of(ch.id)) return fail(o, op, 'trade', 'Finish your trade first.');
    const recent = (sentLog.get(ch.id) || []).filter(t => t > wallNow() - 3600000);
    if (recent.length >= R.perHour) return fail(o, op, 'slow', 'That is a lot of letters. Try again later.');
    const to = await store.charByName(String(m.to || ''));
    if (!to) return fail(o, op, 'notFound', 'Nobody by that name.');
    if (to.id === ch.id) return fail(o, op, 'self', 'You cannot post a letter to yourself.');
    if ((to.ignore || []).includes(ch.id)) return fail(o, op, 'ignored', 'They are not taking your mail.');
    if (busy(o) || online.get(ch.id) !== o) return fail(o, op, 'busy', 'Busy, try again in a moment.');
    // re-check after the await: the pack may have changed
    const now2 = (ch.bag || []).map(i => i.uid);
    if (uids.some(u => !now2.includes(u)) || cost > (ch.gold || 0)) return fail(o, op, 'item', 'You do not have that item.');
    o.frozen = true; o.saving = true; o.mailBusy = true;
    syncChar(o);
    const out = new Set(uids);
    const next = JSON.parse(JSON.stringify(ch));
    const carried = next.bag.filter(i => out.has(i.uid));
    next.bag = next.bag.filter(i => !out.has(i.uid));
    next.gold = (next.gold || 0) - cost;
    const seq = o.seq;
    const t = wallNow();
    let r;
    try {
      r = await store.mailSend({ ch: next, fence: o.fence }, { to: to.id, fromChar: ch.id, fromName: ch.name, subject: clean(m.subject, R.subjectMax), body: clean(m.body, R.bodyMax), gold, items: carried, kind: 'player', sentAt: t, expiresAt: t + R.expireMs });
    } catch (err) { log('mail send failed', err && err.message); r = false; }
    o.frozen = false; o.saving = false; o.mailBusy = false;
    if (!r) { counters.mailFails = (counters.mailFails || 0) + 1; return fail(o, op, 'failed', 'The letter did not go. Nothing left your pack.'); }
    ch.bag = (ch.bag || []).filter(i => !out.has(i.uid));
    ch.gold = (ch.gold || 0) - cost;
    ch.version = next.version;
    o.savedSeq = Math.max(o.savedSeq, seq);
    recent.push(t); sentLog.set(ch.id, recent);
    econ.add('sink', 'postage', { gold: R.postage }, ch.level || 1);
    counters.mailSent = (counters.mailSent || 0) + 1;
    if (o.conn) o.conn.sendJSON({ t: 'bag', add: [], remove: [...out], gold: ch.gold });
    reply(o, op, { ok: true, id: r.id, to: to.name, cost });
    send({ k: 'mailed', to: to.id });
    if (o.savePending) { o.savePending = false; saveNow(o); }
  }

  async function take(o, m) {
    const ch = o.char, op = 'take';
    if (busy(o)) return fail(o, op, 'busy', 'Busy, try again in a moment.');
    if (trades.of(ch.id)) return fail(o, op, 'trade', 'Finish your trade first.');
    const mail = await store.mailGet(ch.id, m.id ?? -1);
    if (!mail) return fail(o, op, 'missing', 'No such letter.');
    // play-test 5 (T20): a SYSTEM letter (a gift, an event share) is taken wherever you stand; a player's letter in a town
    if (mail.kind === 'player' && !inTown(o)) return fail(o, op, 'town', 'Collect letters in a town.');
    if (mail.taken || (!mail.gold && !mail.itemsFull.length)) return fail(o, op, 'empty', 'Nothing in it to take.');
    if (busy(o) || online.get(ch.id) !== o) return fail(o, op, 'busy', 'Busy, try again in a moment.');
    const cap = typeof BAG_MAX === 'function' ? BAG_MAX(o) : BAG_MAX;      // W19: a backpack changes it per player
    if ((ch.bag || []).length + mail.itemsFull.length > cap) return reply(o, op, { ok: false, why: 'bagFull', msg: 'Your bag is full.', need: mail.itemsFull.length, free: Math.max(0, cap - (ch.bag || []).length) });
    o.frozen = true; o.saving = true; o.mailBusy = true;
    syncChar(o);
    const got = mail.itemsFull.map(i => JSON.parse(JSON.stringify(i)));
    const next = JSON.parse(JSON.stringify(ch));
    next.bag = (next.bag || []).concat(got);
    next.gold = (next.gold || 0) + mail.gold;
    const seq = o.seq;
    let ok = false;
    try { ok = await store.mailTake({ ch: next, fence: o.fence }, mail.id, got.map(i => i.uid), wallNow()); }
    catch (err) { log('mail take failed', err && err.message); ok = false; }
    o.frozen = false; o.saving = false; o.mailBusy = false;
    if (!ok) { counters.mailFails = (counters.mailFails || 0) + 1; return fail(o, op, 'failed', 'Could not take it just now. The letter still holds everything.'); }
    for (const i of got) delete i.apart;          // a split-off stack that changed hands joins the receiver's stacks
    ch.bag = (ch.bag || []).concat(got);
    ch.gold = (ch.gold || 0) + mail.gold;
    ch.version = next.version;
    o.savedSeq = Math.max(o.savedSeq, seq);
    counters.mailTaken = (counters.mailTaken || 0) + 1;
    if (o.conn) o.conn.sendJSON({ t: 'bag', add: got, remove: [], gold: ch.gold });
    reply(o, op, { ok: true, id: mail.id, items: got.length, gold: mail.gold });
    restack(o);                 // U5: posted potions join the stacks already carried
    tellUnread(o);
    if (o.savePending) { o.savePending = false; saveNow(o); }
  }

  async function op(o, m) {
    if (!MAIL_OPS.includes(m.op)) return 'op';
    const ch = o.char;
    switch (m.op) {
      case 'list': return list(o);
      case 'read': {
        const mail = await store.mailGet(ch.id, m.id ?? -1);
        if (!mail) return fail(o, 'read', 'missing', 'No such letter.');
        if (!mail.read) await store.mailRead(ch.id, mail.id, wallNow());
        const { itemsFull, ...view } = mail;
        if (o.conn) o.conn.sendJSON({ t: 'mailOpen', mail: { ...view, read: true, items: itemsFull.length ? itemsFull : view.items } });
        return tellUnread(o);
      }
      case 'send': return sendMail(o, m);
      case 'take': return take(o, m);
      case 'return': {
        const r = await store.mailReturn(ch.id, m.id ?? -1, wallNow());
        if (!r) return fail(o, 'return', 'missing', 'That letter cannot be sent back.');
        send({ k: 'mailed', to: r.to });
        reply(o, 'return', { ok: true, id: m.id });
        return list(o);
      }
      case 'delete': {
        const ok = await store.mailDelete(ch.id, m.id ?? -1);
        if (!ok) return fail(o, 'delete', 'holds', 'Take what is in it first (or send it back).');
        reply(o, 'delete', { ok: true, id: m.id });
        tellUnread(o);
        return list(o);
      }
    }
    return 'op';
  }

  return {
    op: (o, m) => Promise.resolve(op(o, m)).catch(err => { o.mailBusy = false; log('mail op failed', err && err.stack); fail(o, m.op, 'failed', 'That did not work.'); }),
    R,
  };
}
