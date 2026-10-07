// Mailbox (M3, protocol §16.5): the inbox (unread first), reading a letter, taking what it holds, sending it back,
// deleting an empty one, replying, and writing a letter with up to 6 items from the bag and some gold (postage
// 1 gold). Reading works anywhere; sending and taking only in a town (the server says so: mailR why 'town').
// Server: mailList, mailOpen, mailR, mailNew {unread} (gateway), and a `bag` after every send/take. DOM only.

import { composeCheck, expiresText, attachText, hasAttachments, sortMail, MAIL_LIMITS, MAIL_WHY } from './social-core.js';
import { createPanel, h, confirmBox } from './ui-panel.js';
import { rememberItems } from './ui/item-card.js';
import { iconFor } from './ui/item-icons.js';
import { bagRoom, isGift, isCrate } from './ui/pt5-core.js';

/** An item square with its 3D icon and the shared item card on hover (P7/P15/P16). */
let synthUid = 0;
function itemSlot(it, cls = '', props = {}) {
  if (it.uid == null) it.uid = 'mail:' + (++synthUid);
  rememberItems([it]);
  const url = iconFor(it);
  return h('div.islot.r-' + (it.rarity || 'common') + cls, { ...props, dataset: { ...(props.dataset || {}), tipRender: 'item', tipItem: String(it.uid) } },
    url ? h('img', { src: url, alt: '', draggable: false }) : h('span.glyph', {}, (it.name || '?')[0]));
}

const when = t => { if (!t) return ''; const d = new Date(t), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }); };

export function createMail({ net: getNet, hud, bag, me, inTown }) {
  const net = () => getNet();
  const S = { list: [], unread: 0, view: 'inbox', open: null, draft: { to: '', subject: '', body: '', items: [], gold: 0 }, sending: false };
  const panel = createPanel({ id: 'mail', title: 'Mail', width: 420, cls: 'mail-panel', onOpen: () => { S.view = S.view === 'compose' ? 'compose' : 'inbox'; net()?.mail('list'); draw(); } });

  function setBadge() {
    const b = document.getElementById('menu-mail')?.querySelector('b');
    if (b) b.textContent = S.unread ? String(S.unread) : '';
    document.getElementById('menu-mail')?.classList.toggle('alert', S.unread > 0);
  }
  function draw() {
    setBadge();
    if (!panel.isOpen) return;
    if (S.view === 'read' && S.open) return drawRead();
    if (S.view === 'compose') return drawCompose();
    drawInbox();
  }
  /** System letters (a thank-you gift, an event's reward) can be read AND emptied anywhere; players' letters need a town. */
  const isSystem = m => !!m && !!m.kind && m.kind !== 'player' && m.kind !== 'return';
  function townNote(m = null) { return inTown?.() || isSystem(m) ? null : h('p.tiny-left.warn-text', {}, 'You can read letters anywhere, but sending and taking need a town.'); }

  function drawInbox() {
    panel.setTitle('Mail', S.unread ? `${S.unread} unread` : `${S.list.length} letter${S.list.length === 1 ? '' : 's'}`);
    const rows = sortMail(S.list).map(m => h('li.ml-row' + (m.read ? '' : '.unread') + (m.kind === 'return' ? '.returned' : ''), { tabIndex: 0, onclick: () => read(m.id), onkeydown: e => { if (e.key === 'Enter') read(m.id); } },
      h('div.ml-top', {}, h('b', {}, m.kind === 'return' ? `Returned: ${m.from || 'unknown'}` : m.from || 'Someone'), h('span.ml-when', {}, when(m.sentAt))),
      h('div.ml-subj', {}, m.subject || '(no subject)'),
      h('div.ml-meta', {}, hasAttachments(m) ? h('span.ml-att' + (m.kind === 'gift' ? '.gift' : ''), {}, (m.kind === 'gift' ? '❖ ' : '✉ ') + attachText(m)) : m.taken && (m.items?.length || m.gold) ? h('span.ml-taken', {}, 'Taken') : null,
        m.kind !== 'return' && hasAttachments(m) ? h('span.ml-exp', {}, expiresText(m.expiresAt)) : null)));
    panel.fill(
      h('div.row', {}, h('button.primary.small', { type: 'button', onclick: () => compose() }, 'Write a letter'), h('span.grow'), h('button.ghost.small', { type: 'button', onclick: () => net()?.mail('list') }, 'Refresh')),
      townNote(),
      rows.length ? h('ul.ml-list', {}, rows) : h('p.empty', {}, 'No letters. Anyone can write to you by your character name.'));
  }
  function read(id) { S.view = 'read'; S.open = S.list.find(m => m.id === id) || { id }; net()?.mail('read', { id }); draw(); }

  function drawRead() {
    const m = S.open;
    panel.setTitle(m.subject || '(no subject)', m.from ? `from ${m.from}` : '');
    const list = m.items || [];
    const items = list.map(it => itemSlot(it, (m.taken ? '.taken' : '') + (isGift(it) ? '.gift' : isCrate(it) ? '.crate' : '')));
    const left = hasAttachments(m);
    // T20 (play-test 5): taking needs room in the bag — say so BEFORE the click, with the numbers
    const room = bagRoom(bag?.state?.bag?.length || 0, list.length, bag?.max || undefined);
    const gift = list.find(it => isGift(it) || isCrate(it)) || null;
    const canTake = left && room.ok && (inTown?.() || isSystem(m));
    panel.fill(
      h('div.ml-head', {}, h('span', {}, when(m.sentAt)), m.kind === 'return' ? h('span.ml-tag', {}, 'Returned to you') : isSystem(m) ? h('span.ml-tag.sys', {}, m.kind === 'gift' ? 'A gift' : m.kind === 'event' ? 'Event reward' : 'From the realm') : null, left && m.kind !== 'return' && m.expiresAt ? h('span.ml-exp', {}, expiresText(m.expiresAt)) : null),
      h('div.ml-body', {}, m.body || (m.body === undefined ? 'Opening…' : '')),
      list.length || m.gold ? h('div.ml-attach' + (gift && left ? '.has-gift' : ''), {}, h('span.label', {}, m.taken ? 'It held' : `Inside — ${attachText(m)}`), h('div.ml-items', {}, items, m.gold ? h('span.ml-gold', {}, `${m.gold} gold`) : null),
        left && list.length ? h('p.ml-names', {}, list.map(it => it.name).filter(Boolean).join(' · ')) : null,
        gift && left ? h('p.ml-gifthint', {}, isGift(gift) ? 'The gift goes into your bag and is unwrapped at once.' : 'The crate goes into your bag — click it there to open it.') : null) : null,
      left && !room.ok ? h('p.tiny-left.warn-text.ml-room', {}, room.why) : null,
      left ? townNote(m) : null,
      h('div.row.end', {},
        h('button.ghost', { type: 'button', onclick: () => { S.view = 'inbox'; S.open = null; draw(); } }, '← Inbox'),
        h('span.grow'),
        m.kind !== 'return' && m.fromChar ? h('button.ghost', { type: 'button', onclick: () => compose({ to: m.from, subject: m.subject && !/^re:/i.test(m.subject) ? `Re: ${m.subject}`.slice(0, MAIL_LIMITS.subject) : m.subject || '' }) }, 'Reply') : null,
        left && m.kind !== 'return' && m.fromChar ? h('button.ghost', { type: 'button', title: 'Send it back to the sender, untouched', onclick: async () => { if (await confirmBox('Send this letter back, with everything in it?', { yes: 'Send back' })) net()?.mail('return', { id: m.id }); } }, 'Return') : null,
        !left ? h('button.ghost.danger-text', { type: 'button', onclick: () => net()?.mail('delete', { id: m.id }) }, 'Delete') : null,
        left ? h('button.primary.small', { type: 'button', disabled: !canTake, dataset: { act: 'take' }, title: canTake ? '' : (room.ok ? 'Sending and taking need a town.' : room.why), onclick: () => { S.taking = { id: m.id, items: list.slice() }; net()?.mail('take', { id: m.id }); } }, gift && isGift(gift) ? 'Take and unwrap' : list.length || !m.gold ? 'Take all' : 'Take the gold') : null));
  }

  function compose(pre = {}) {
    S.draft = { to: '', subject: '', body: '', items: [], gold: 0, ...pre };
    S.view = 'compose'; panel.open(); draw();
  }
  function drawCompose() {
    const d = S.draft;
    panel.setTitle('Write a letter', `postage ${MAIL_LIMITS.postage} gold`);
    const to = h('input', { maxLength: 16, placeholder: 'Character name', value: d.to, 'aria-label': 'To', oninput: () => { d.to = to.value; check(); } });
    const subj = h('input', { maxLength: MAIL_LIMITS.subject, placeholder: 'Subject', value: d.subject, 'aria-label': 'Subject', oninput: () => { d.subject = subj.value; check(); } });
    const body = h('textarea', { maxLength: MAIL_LIMITS.body, rows: 4, placeholder: 'Your letter', 'aria-label': 'Letter', oninput: () => { d.body = body.value; count.textContent = `${body.value.length}/${MAIL_LIMITS.body}`; check(); } });
    body.value = d.body;
    const count = h('small.count', {}, `${d.body.length}/${MAIL_LIMITS.body}`);
    const gold = h('input', { type: 'number', min: 0, step: 1, value: d.gold || '', placeholder: '0', 'aria-label': 'Gold to send', oninput: () => { d.gold = Math.max(0, Math.floor(+gold.value || 0)); check(); } });
    const note = h('p.note'), send = h('button.primary.small', { type: 'button', onclick: () => doSend() }, 'Send');
    const attached = h('div.ml-items.attached');
    const pick = h('div.ml-pick');
    function drawItems() {
      const bagItems = bag?.state?.bag || [];
      d.items = d.items.filter(u => bagItems.some(i => i.uid === u));
      attached.replaceChildren(...d.items.map(u => { const it = bagItems.find(i => i.uid === u); return itemSlot(it, '', { onclick: () => { d.items = d.items.filter(x => x !== u); drawItems(); check(); } }); }),
        ...Array.from({ length: Math.max(0, MAIL_LIMITS.items - d.items.length) }, () => h('div.islot.empty')));
      pick.replaceChildren(...bagItems.filter(i => !d.items.includes(i.uid)).map(it => itemSlot(it, '', {
        dataset: { uid: it.uid },
        onclick: () => { if (d.items.length >= MAIL_LIMITS.items) { note.textContent = MAIL_WHY.items; return; } d.items.push(it.uid); drawItems(); check(); } })));
      if (!bagItems.length) pick.replaceChildren(h('p.empty', {}, 'Your bag is empty.'));
    }
    function check() {
      const r = composeCheck(d, { gold: bag?.state?.gold ?? 0, me: me().name });
      send.disabled = !r.ok || S.sending;
      send.textContent = r.ok ? `Send (${r.cost} gold)` : 'Send';
      note.textContent = r.ok || (!d.to && !d.subject && !d.body) ? '' : r.why;
      return r;
    }
    function doSend() {
      const r = check(); if (!r.ok) { note.textContent = r.why; return; }
      S.sending = true; send.disabled = true; send.textContent = 'Sending…';
      net()?.mail('send', { to: d.to.trim(), subject: d.subject, body: d.body, items: [...d.items], gold: d.gold || 0 });
      setTimeout(() => { if (S.sending) { S.sending = false; check(); } }, 6000);
    }
    drawItems();
    panel.fill(
      h('label.fl', {}, h('span', {}, 'To'), to), h('label.fl', {}, h('span', {}, 'Subject'), subj), body, count,
      h('div.ml-attach', {}, h('span.label', {}, `Items (${d.items.length}/${MAIL_LIMITS.items}) — click your bag below`), attached),
      h('div.ml-pick-wrap', {}, pick),
      h('label.fl.gold', {}, h('span', {}, 'Gold'), gold, h('small', {}, `you carry ${bag?.state?.gold ?? 0}`)),
      townNote(), note,
      h('div.row.end', {}, h('button.ghost', { type: 'button', onclick: () => { S.view = 'inbox'; draw(); } }, 'Cancel'), h('span.grow'), send));
    check();
    (d.to ? subj : to).focus();
  }

  function wire(n) {
    n.on('mailList', m => {
      S.list = m.mail || []; S.unread = m.unread ?? S.list.filter(x => !x.read).length;
      if (S.open) S.open = { ...S.open, ...(S.list.find(x => x.id === S.open.id) || {}) };
      draw();
    });
    n.on('mailOpen', m => {
      const mail = m.mail; if (!mail) return;
      S.list = S.list.map(x => (x.id === mail.id ? { ...x, ...mail, read: true, items: (mail.items || []).map(i => ({ ...i })) } : x));
      if (!S.list.some(x => x.id === mail.id)) S.list.push(mail);
      S.unread = S.list.filter(x => !x.read).length;
      if (S.open && S.open.id === mail.id) S.open = { ...mail, read: true };
      draw();
    });
    n.on('mailNew', m => {
      const more = (m.unread || 0) > S.unread;
      S.unread = m.unread || 0; setBadge();
      if (more) { hud.toast('You have mail', 'good'); hud.chat('A letter has arrived. Open your mail with M.', 'system'); }
      if (panel.isOpen && S.view === 'inbox') net()?.mail('list');
    });
    n.on('mailR', r => {
      if (r.op === 'send') S.sending = false;
      if (!r.ok && r.why === 'bagFull') { hud.toast(r.msg || bagRoom(0, r.need ?? 1, r.free ?? 0).why, 'warn'); S.taking = null; draw(); return; }
      if (!r.ok) { S.taking = null; const t = r.msg || MAIL_WHY[r.why] || 'That did not work.'; hud.toast(t, 'warn'); if (panel.isOpen && S.view === 'compose') draw(); return; }
      if (r.op === 'send') { hud.toast(`Letter sent to ${r.to || S.draft.to}`, 'good'); hud.chat(`Your letter is on its way to ${r.to || S.draft.to}${r.cost ? ` (${r.cost} gold postage)` : ''}.`, 'system'); S.view = 'inbox'; S.draft = { to: '', subject: '', body: '', items: [], gold: 0 }; }
      else if (r.op === 'take') { hud.toast('Taken from the letter', 'good'); if (S.open) S.open = { ...S.open, taken: true }; const t = S.taking; S.taking = null; if (t) api.onTaken?.(t.items); }
      else if (r.op === 'return') { hud.toast('Letter sent back', 'info'); S.view = 'inbox'; S.open = null; }
      else if (r.op === 'delete') { S.list = S.list.filter(x => x.id !== r.id); S.view = 'inbox'; S.open = null; }
      net()?.mail('list');
      draw();
    });
    n.on('bag', () => { if (panel.isOpen && (S.view === 'compose' || S.view === 'read')) draw(); });
  }

  /** onTaken(items): set by ui/pt5.js — a gift taken from a letter is unwrapped at once. */
  const api = { wire, panel, compose, draw, onTaken: null, get state() { return S; } };
  return api;
}
