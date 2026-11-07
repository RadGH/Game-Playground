// Room chat (live report #34, 2026-11-06: "Add chat button up right next to menu button"). A 💬 button sits beside
// the ☰ on every screen of a room (in a minigame it sits under the ☰, so the score bars keep their width). It opens a
// sheet: one-tap quick lines and reactions, a short text box, and the last few lines said. What anyone says pops up as
// a bubble (face, name in their seat colour, the line) on every screen in the room, the big screen too, for a few
// seconds, never more than three at once, and never over the controls. The server (js/sim/room.js 'chat') cleans each
// line (protocol cleanChat: 1-80 characters) and keeps the last 12 for a phone that joins or comes back ('chatlog').
// Everything is drawn with textContent, so a line can never be markup.
//   const chat = createChat({ net, members, me, faceSrc, seatOf, sfx, openSheet, closeSheet });
//   chat.button (an element), chat.show(inRoom), chat.onChat(msg), chat.onLog(msg), chat.open(), chat.clear()
import { h } from './gamehud.js';
import { CHAT_QUICK, CHAT_MAX, cleanChat } from '../shared/protocol.js';

export const BUBBLE_MS = 5000, BUBBLES_MAX = 3, HISTORY_SHOWN = 8;

export function createChat({ net, members, me, faceSrc, seatOf, sfx = () => {}, openSheet, closeSheet }) {
  const button = h('button', 'chat-btn', '💬'); button.type = 'button'; button.title = 'Chat'; button.setAttribute('aria-label', 'Chat'); button.hidden = true;
  const dot = h('i', 'chat-dot'); dot.hidden = true; button.append(dot);
  const feed = h('div', 'chat-feed'); feed.setAttribute('aria-live', 'polite');
  document.body.append(button, feed);
  const log = [];
  let sheet = null, unread = 0;
  button.onclick = () => (sheet ? close() : open());

  function line(m, cls) {
    const el = h('div', cls), who = members().find(x => x.pid === m.pid), seat = seatOf(who) || (m.seat != null ? seatOf({ seat: m.seat }) : null);
    if (seat) el.style.setProperty('--seat', seat.color);
    const src = who ? faceSrc(who) : null;
    if (src) { const img = document.createElement('img'); img.className = 'chat-face'; img.alt = ''; img.src = src; el.append(img); }
    const name = h('b', 'chat-name'); name.textContent = m.pid === me() ? 'You' : (who?.name || m.name || 'Someone');
    const text = h('span', 'chat-text'); text.textContent = m.text;
    el.append(name, text); return el;
  }
  function bubble(m) {
    const el = line(m, 'chat-bubble' + (m.pid === me() ? ' mine' : ''));
    feed.append(el);
    while (feed.children.length > BUBBLES_MAX) feed.firstChild.remove();
    setTimeout(() => el.classList.add('out'), BUBBLE_MS - 400); setTimeout(() => el.remove(), BUBBLE_MS);
  }
  function onChat(m) {
    log.push(m); while (log.length > 20) log.shift();
    if (sheet) drawHistory(); else { bubble(m); if (m.pid !== me()) { unread++; dot.hidden = false; } }
    if (m.pid !== me()) sfx('tap');
  }
  function onLog(m) { log.length = 0; for (const x of m.list || []) log.push(x); if (sheet) drawHistory(); }
  function drawHistory() {
    const box = sheet?.querySelector('.chat-history'); if (!box) return;
    box.replaceChildren(...(log.length ? log.slice(-HISTORY_SHOWN).map(m => line(m, 'chat-line')) : [Object.assign(h('p', 'note'), { textContent: 'Nothing said yet. Say hi!' })]));
  }
  function say(text) { const t = cleanChat(text); if (!t) return false; net.send({ t: 'chat', text: t }); sfx('tap'); return true; }
  function open() {
    if (sheet) return;
    unread = 0; dot.hidden = true;
    sheet = h('div', 'modal chat-sheet');
    const panel = h('div', 'panel');
    panel.innerHTML = `<div class="row head"><h2>Chat</h2><button class="btn small" type="button" data-close>Close</button></div>
      <div class="chat-history"></div>
      <div class="chat-quick">${CHAT_QUICK.map((q, i) => `<button class="btn small${[...q].length <= 2 ? ' emo' : ''}" type="button" data-q="${i}"></button>`).join('')}</div>
      <form class="chat-say"><input class="chat-input" maxlength="${CHAT_MAX}" placeholder="Say something…" autocomplete="off" enterkeyhint="send"><button class="btn primary" type="submit">Send</button></form>`;
    panel.querySelectorAll('[data-q]').forEach(b => { b.textContent = CHAT_QUICK[+b.dataset.q]; });
    sheet.append(panel);
    sheet.addEventListener('click', e => {
      if (e.target === sheet || e.target.closest('[data-close]')) { close(); return; }
      const q = e.target.closest('[data-q]'); if (q) { say(CHAT_QUICK[+q.dataset.q]); close(); }
    });
    panel.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const inp = panel.querySelector('.chat-input'); if (say(inp.value)) { inp.value = ''; close(); } });
    openSheet(sheet, () => { sheet = null; });
    drawHistory();
  }
  function close() { if (sheet) closeSheet(); }
  function show(on) { button.hidden = !on; if (!on) { close(); feed.replaceChildren(); log.length = 0; unread = 0; dot.hidden = true; } }
  return { button, feed, onChat, onLog, open, close, show, say, get log() { return log; }, get isOpen() { return !!sheet; } };
}
