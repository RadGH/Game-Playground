// The match HUD: round / wave and time across the top, a score chip per player (or per team), a big centre banner for
// "Round 2", "Fight!", "Pip wins the round!", and small toasts down the side for who went out and how.
import { esc } from './feedback.js';

export function createHud(root) {
  const el = document.createElement('div'); el.className = 'hud'; root.append(el);
  el.innerHTML = `<div class="hud-top"><div class="hud-round"></div><div class="hud-scores"></div></div><div class="hud-banner"></div><div class="hud-toasts"></div><div class="hud-hint"></div>`;
  const $ = s => el.querySelector(s);
  let bannerTimer = 0, lastScores = '';
  return {
    el,
    show(v) { el.classList.toggle('on', !!v); },
    /** snap: the latest snapshot; who(pidOrTeam) -> { name, color }; teams: score keys are teams. */
    update(snap, { who, teamMode, waves }) {
      const bits = [];
      if (waves) bits.push(`Wave <b>${snap.wave ?? 1}</b>`);
      else bits.push(`Round <b>${snap.round ?? 1}</b> of ${snap.rounds ?? 1}`);
      if (Number.isFinite(snap.timeLeft) && snap.phase === 'fight') bits.push(`<span class="time${snap.timeLeft < 10 ? ' low' : ''}">${Math.ceil(snap.timeLeft)}</span>`);
      $('.hud-round').innerHTML = bits.join(' · ');
      const sc = snap.score || {};
      const key = JSON.stringify(sc) + teamMode;
      if (key !== lastScores) {
        lastScores = key;
        $('.hud-scores').innerHTML = Object.entries(sc).map(([k, n]) => { const w = who(k, teamMode); return w ? `<span class="hs" style="--seat:${w.color}"><i></i>${esc(w.name)} <b>${n}</b></span>` : ''; }).join('');
      }
    },
    banner(text, { secs = 1.6, cls = '' } = {}) {
      const b = $('.hud-banner'); b.className = 'hud-banner ' + cls; b.textContent = text;
      void b.offsetWidth; b.classList.add('on'); clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('on'), secs * 1000);
    },
    toast(html, color = '#fff') {
      const t = document.createElement('div'); t.className = 'hud-toast'; t.style.setProperty('--seat', color); t.innerHTML = html;
      $('.hud-toasts').append(t); setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3100);
      while ($('.hud-toasts').children.length > 5) $('.hud-toasts').firstChild.remove();
    },
    hint(html) { $('.hud-hint').innerHTML = html || ''; },
  };
}
