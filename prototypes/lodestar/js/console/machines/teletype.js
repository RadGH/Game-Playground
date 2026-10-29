// Teletype: the message log. Paper rolls up, the newest line hammers out a few characters at a time, important
// lines print in red ribbon. It PAGES, never scrolls (no scrolling panel inside the page on phones): OLDER / NEWER
// move a page, PIN keeps the bottom line on the cork strip at the top, tapping the strip lets it go.
// M8 adds the Commander's daily report printer to this file.
import { machinePanel } from './panel.js';

/** Pure log model: lines newest last; `page` 0 = newest. */
export function logModel({ max = 200 } = {}) {
  const lines = []; let page = 0, pinned = null;
  return {
    get lines() { return lines; }, get page() { return page; }, get pinned() { return pinned; },
    add(line) { lines.push(line); if (lines.length > max) lines.shift(); if (page) page++; return line; },
    /** The lines on screen for `rows` rows. */
    visible(rows) { const end = Math.max(0, lines.length - page * rows); return lines.slice(Math.max(0, end - rows), end); },
    older(rows) { const maxPage = Math.max(0, Math.ceil(lines.length / rows) - 1); page = Math.min(maxPage, page + 1); return page; },
    newer() { page = Math.max(0, page - 1); return page; },
    pin(line) { pinned = line; }, unpin() { pinned = null; },
  };
}

export function mountTeletype(C) {
  const { el, body } = machinePanel({ id: 'teletype', title: 'TELETYPE' });
  body.innerHTML = `
    <button type="button" class="tty-pinned" aria-label="Pinned line (tap to let go)"><span class="tty-pin-icon"></span><span class="tty-pin-text">NOTHING PINNED</span></button>
    <div class="tty-paper"><div class="tty-lines" aria-live="polite"></div><div class="tty-head" aria-hidden="true"></div></div>
    <div class="tty-ctl">
      <button type="button" class="tty-btn" data-tty="older" aria-label="Older lines">▲<small>OLDER</small></button>
      <button type="button" class="tty-btn" data-tty="newer" aria-label="Newer lines">▼<small>NEWER</small></button>
      <button type="button" class="tty-btn" data-tty="pin" aria-label="Pin the bottom line">PIN</button>
    </div>`;
  const log = logModel();
  const linesEl = body.querySelector('.tty-lines'), paper = body.querySelector('.tty-paper'), pinBtn = body.querySelector('.tty-pinned');
  let typing = null, queue = [];
  const rows = () => Math.max(2, Math.floor((paper.clientHeight - 6) / 18));
  const fmt = l => `<span class="tty-time">${l.time}</span> ${l.who ? `<span class="tty-who">${l.who.toUpperCase()}</span> ` : ''}`;
  function draw() {
    const vis = log.visible(rows());
    linesEl.innerHTML = vis.map(l => {
      const shown = typing && typing.line === l ? l.text.slice(0, typing.n) : l.text;
      return `<div class="tty-line${l.red ? ' red' : ''}${typing && typing.line === l ? ' typing' : ''}">${fmt(l)}${escapeHtml(shown)}</div>`;
    }).join('');
    el.dataset.page = String(log.page);
    body.querySelector('[data-tty=newer]').classList.toggle('dim', log.page === 0);
    pinBtn.classList.toggle('has', !!log.pinned);
    pinBtn.querySelector('.tty-pin-text').textContent = log.pinned ? `${log.pinned.time} ${log.pinned.text}` : 'NOTHING PINNED';
  }
  function tick() {
    if (!typing) { const next = queue.shift(); if (!next) return; typing = { line: log.add(next), n: 0 }; C.room.play('carriage'); }
    // faster when there is a backlog, so the paper never falls behind the game
    const speed = 3 + queue.length * 4;
    typing.n = Math.min(typing.line.text.length, typing.n + speed);
    C.room.play('key');
    if (typing.n >= typing.line.text.length) { if (typing.line.red) C.room.play('bell'); typing = null; }
    draw();
  }
  setInterval(tick, 45);
  body.querySelector('[data-tty=older]').addEventListener('click', () => { log.older(rows()); C.room.play('press'); draw(); });
  body.querySelector('[data-tty=newer]').addEventListener('click', () => { log.newer(); C.room.play('press'); draw(); });
  body.querySelector('[data-tty=pin]').addEventListener('click', () => { const v = log.visible(rows()); const l = v[v.length - 1]; if (l) { log.pin(l); C.room.play('press'); draw(); } });
  pinBtn.addEventListener('click', () => { if (log.pinned) { log.unpin(); C.room.play('press'); draw(); } });
  new ResizeObserver(draw).observe(paper);
  return {
    el, log,
    print({ who = '', text, red = false, time }) { queue.push({ who, text: String(text), red, time: time || C.clockText() }); },
    get typing() { return !!typing || queue.length > 0; },
    flush() { while (queue.length || typing) { if (typing) { typing.n = typing.line.text.length; typing = null; } else tick(); } draw(); },
  };
}
const escapeHtml = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
