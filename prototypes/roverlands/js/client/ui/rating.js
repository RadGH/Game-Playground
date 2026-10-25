// The vehicle rating card (game-standards §5): after you leave a vehicle you drove for a minute or more (once per
// vehicle per visit), a small card that does not stop the game: "How did the Trail Jeep feel?" 👍 / 👎, then reasons
// that say WHAT kind of good or bad, and "Tell us more". Sent to the room as { t:'rate', what, up, reasons, note },
// which goes to the insights log. Tapping nothing: it slides away after 25 s.
import { RATE_REASONS } from '../../net/protocol.js';
import { el, esc } from './dom.js';

export function createRating({ root, send, onRated = () => {}, vehicleName = k => k }) {
  const asked = new Set();
  let card = null, timer = 0;
  function close() { clearTimeout(timer); card?.remove(); card = null; }
  function show(kind) {
    close();
    let up = null; const picked = new Set();
    card = el('div', 'rl-rate');
    const draw = () => {
      const list = up == null ? [] : (up ? RATE_REASONS.up : RATE_REASONS.down);
      card.innerHTML = `<button class="rl-rate-x" data-x aria-label="Close">×</button><b>How did the ${esc(vehicleName(kind))} feel?</b>
        <div class="rl-row"><button class="rl-pill thumb${up === true ? ' on' : ''}" data-up="1" aria-label="Good">👍</button><button class="rl-pill thumb${up === false ? ' on' : ''}" data-up="0" aria-label="Bad">👎</button></div>
        ${up == null ? '' : `<div class="rl-reasons">${list.map(([id, label]) => `<button class="rl-pill small${picked.has(id) ? ' on' : ''}" data-r="${id}">${esc(label)}</button>`).join('')}</div>
        <textarea rows="2" maxlength="400" placeholder="Tell us more (optional)"></textarea>
        <div class="rl-row end"><button class="rl-btn small primary" data-send>Send</button></div>`}`;
    };
    draw();
    card.addEventListener('click', e => {
      clearTimeout(timer); timer = setTimeout(close, 45000);
      if (e.target.closest('[data-x]')) return close();
      const u = e.target.closest('[data-up]'); if (u) { const note = card.querySelector('textarea')?.value || ''; up = u.dataset.up === '1'; picked.clear(); draw(); if (note) card.querySelector('textarea').value = note; return; }
      const r = e.target.closest('[data-r]'); if (r) { picked.has(r.dataset.r) ? picked.delete(r.dataset.r) : picked.add(r.dataset.r); r.classList.toggle('on'); return; }
      if (e.target.closest('[data-send]')) {
        const note = card.querySelector('textarea')?.value.trim() || '';
        const reasons = [...picked];
        send({ t: 'rate', what: kind, up: !!up, reasons, ...(note ? { note: note.slice(0, 400) } : {}) });
        const labels = (up ? RATE_REASONS.up : RATE_REASONS.down).filter(([id]) => picked.has(id)).map(x => x[1]);
        onRated({ what: kind, up: !!up, reasons, labels });
        card.innerHTML = '<b>Thanks! That helps tune it.</b>'; clearTimeout(timer); timer = setTimeout(close, 1800);
      }
    });
    root.append(card);
    timer = setTimeout(close, 25000);
  }
  return {
    /** The game calls this when the player leaves a seat they drove. Shows the card when it is due. */
    vehicleLeft(kind, secondsDriven) {
      if (!kind || !(secondsDriven >= 60) || asked.has(kind)) return false;
      asked.add(kind); show(kind); return true;
    },
    show, close, get open() { return !!card; },
  };
}
