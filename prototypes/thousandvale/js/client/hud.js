// The heads-up display: your frame, the target frame, the action bar, chat, the connection pill,
// toasts, the zone banner and the death screen. DOM only (index.html holds the markup), no game rules.

const $ = id => document.getElementById(id);

const ICONS = {
  sword: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
};

export function createHud({ onSlot, onChatSubmit, onChatFocus, onRise } = {}) {
  const el = {
    hud: $('hud'), selfName: $('self-name'), selfLevel: $('self-level'), selfInitial: $('self-initial'),
    selfHp: $('self-hp-fill'), selfLag: $('self-hp-lag'), selfHpText: $('self-hp-text'), selfXp: $('self-xp-fill'), selfXpText: $('self-xp-text'),
    tFrame: $('target-frame'), tName: $('target-name'), tLevel: $('target-level'), tInitial: $('target-initial'), tHp: $('target-hp-fill'), tLag: $('target-hp-lag'), tHpText: $('target-hp-text'), tSub: $('target-sub'),
    toasts: $('toasts'), conn: $('conn'), connText: $('conn-text'), chatLog: $('chat-log'), chatForm: $('chat-form'), chatInput: $('chat-input'),
    bar: $('actionbar'), death: $('death'), deathTimer: $('death-timer'), deathWait: $('death-wait'), rise: $('rise'), banner: $('zone-banner'), zoneName: $('zone-name'), help: $('help'),
  };
  const lag = { self: 1, target: 1, targetId: null };

  // --- action bar: slot 1 is the basic strike; the rest are shown locked until classes port (M1) ---
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const b = document.createElement('button');
    b.className = 'slot' + (i ? ' empty' : '');
    b.innerHTML = `<span class="key">${i + 1}</span>${i === 0 ? ICONS.sword : ''}<span class="cd"></span>`;
    b.title = i === 0 ? 'Strike — a basic weapon attack on your target (1 or F)' : 'Empty';
    b.addEventListener('click', () => { if (!i) onSlot?.(i); });
    el.bar.appendChild(b);
    slots.push({ b, cd: b.querySelector('.cd'), until: 0, len: 1 });
  }

  el.rise.addEventListener('click', () => onRise?.());

  // --- chat ---
  el.chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const t = el.chatInput.value.trim();
    if (t) onChatSubmit?.(t);
    el.chatInput.value = ''; el.chatInput.blur();
  });
  el.chatInput.addEventListener('focus', () => onChatFocus?.(true));
  el.chatInput.addEventListener('blur', () => onChatFocus?.(false));
  el.chatInput.addEventListener('keydown', e => { if (e.key === 'Escape') { el.chatInput.value = ''; el.chatInput.blur(); } e.stopPropagation(); });

  // --- help (remembered collapsed) ---
  try { if (localStorage.getItem('tv.help') === '0') el.help.classList.add('collapsed'); } catch {}
  $('help-toggle').addEventListener('click', () => { const c = el.help.classList.toggle('collapsed'); try { localStorage.setItem('tv.help', c ? '0' : '1'); } catch {} });

  function chat(text, cls = 'system', from = null) {
    const p = document.createElement('p');
    p.className = cls;
    if (from) { const b = document.createElement('b'); b.textContent = `[${from}]: `; p.appendChild(b); }
    p.appendChild(document.createTextNode(text));
    const atBottom = el.chatLog.scrollTop + el.chatLog.clientHeight >= el.chatLog.scrollHeight - 8;
    el.chatLog.appendChild(p);
    while (el.chatLog.children.length > 120) el.chatLog.firstChild.remove();
    if (atBottom) el.chatLog.scrollTop = el.chatLog.scrollHeight;
  }

  const fmt = n => Math.max(0, Math.round(n)).toLocaleString();

  return {
    show() { el.hud.hidden = false; },
    setSelf({ name, level, hp, hpMax, xp, next }) {
      if (name != null) { el.selfName.textContent = name; el.selfInitial.textContent = (name[0] || '?').toUpperCase(); }
      if (level != null) el.selfLevel.textContent = level;
      if (hp != null && hpMax) { const f = Math.max(0, Math.min(1, hp / hpMax)); el.selfHp.style.width = (f * 100) + '%'; el.selfHpText.textContent = `${fmt(hp)} / ${fmt(hpMax)}`; lag.selfTarget = f; }
      if (xp != null && next) { el.selfXp.style.width = Math.min(100, xp / next * 100) + '%'; el.selfXpText.textContent = `${fmt(xp)} / ${fmt(next)} XP`; el.selfXp.parentElement.title = `Experience: ${fmt(xp)} / ${fmt(next)}`; }
    },
    setTarget(a) {
      if (!a) { el.tFrame.hidden = true; lag.targetId = null; return; }
      el.tFrame.hidden = false;
      el.tFrame.classList.toggle('hostile', !!a.hostile);
      el.tName.textContent = a.name; el.tLevel.textContent = a.level; el.tInitial.textContent = (a.name[0] || '?').toUpperCase();
      const f = Math.max(0, Math.min(1, a.hp / (a.hpMax || 1)));
      el.tHp.style.width = (f * 100) + '%';
      el.tHpText.textContent = a.hp <= 0 ? 'Dead' : `${fmt(a.hp)} / ${fmt(a.hpMax)}`;
      el.tSub.textContent = a.kind === 'monster' ? (a.hp <= 0 ? 'Slain' : (a.family ? a.family[0].toUpperCase() + a.family.slice(1) : 'Beast')) : 'Adventurer';
      if (lag.targetId !== a.id) { lag.target = f; lag.targetId = a.id; }
      lag.targetTarget = f;
    },
    tick(dt) {
      // The yellow "chunk lost" bars ease down after a beat.
      if (lag.selfTarget != null) { lag.self += (lag.selfTarget - lag.self) * (lag.selfTarget < lag.self ? Math.min(1, dt * 2.2) : 1); el.selfLag.style.width = (lag.self * 100) + '%'; }
      if (lag.targetTarget != null) { lag.target += (lag.targetTarget - lag.target) * (lag.targetTarget < lag.target ? Math.min(1, dt * 2.2) : 1); el.tLag.style.width = (lag.target * 100) + '%'; }
      const now = performance.now();
      for (const s of slots) {
        const left = Math.max(0, s.until - now);
        s.cd.style.setProperty('--p', left > 0 ? (left / s.len * 100).toFixed(1) + '%' : '0%');
      }
    },
    cooldown(i, ms) { const s = slots[i]; if (!s) return; s.until = performance.now() + ms; s.len = ms; },
    press(i) { const s = slots[i]; if (!s) return; s.b.classList.add('pressed'); setTimeout(() => s.b.classList.remove('pressed'), 110); },
    usable(i, ok) { slots[i]?.b.classList.toggle('unusable', !ok); },
    toast(text, tone = 'info') {
      const d = document.createElement('div'); d.className = `toast ${tone}`; d.textContent = text;
      el.toasts.appendChild(d); setTimeout(() => d.remove(), 2300);
      while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
    },
    conn(status, { rtt = null, mode = 'ws' } = {}) {
      el.conn.className = 'conn ' + status + (mode !== 'ws' && status === 'open' ? ' offline' : '');
      const where = mode === 'ws' ? '' : ' (in-browser server)';
      el.connText.textContent = status === 'open' ? (rtt != null && mode === 'ws' ? `Connected · ${Math.round(rtt)} ms` : `Connected${where}`)
        : status === 'reconnecting' ? 'Reconnecting…' : status === 'connecting' ? 'Connecting…' : 'Disconnected';
    },
    chat,
    focusChat() { el.chatInput.focus(); },
    death(secondsLeft) {
      if (secondsLeft == null) { el.death.hidden = true; return; }
      el.death.hidden = false; el.deathTimer.textContent = Math.max(0, Math.ceil(secondsLeft));
      el.deathWait.hidden = secondsLeft <= 0; el.rise.hidden = secondsLeft > 0;
    },
    zone(name) {
      el.zoneName.textContent = name;
      el.banner.classList.add('show');
      setTimeout(() => el.banner.classList.remove('show'), 3800);
    },
  };
}
