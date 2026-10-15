// The heads-up display: your frame, the target frame, the action bar, chat, the connection pill,
// toasts, the zone banner and the death screen. DOM only (index.html holds the markup), no game rules.

import { skillIconSvg } from './ui/skill-icons.js';
import { uiIconSvg } from '../../../../icons/js/game-icons.js';

const $ = id => document.getElementById(id);

// 2026-10-14: drawn pictures from the icon library (Codex), the same medallion as the spell buttons
const ICONS = {
  sword: uiIconSvg('attack', 30, { medallion: true }),
  lock: uiIconSvg('lock', 24),
};

export function createHud({ onSlot, onChatSubmit, onChatFocus, onRise } = {}) {
  const el = {
    hud: $('hud'), selfName: $('self-name'), selfLevel: $('self-level'), selfInitial: $('self-initial'),
    selfHp: $('self-hp-fill'), selfLag: $('self-hp-lag'), selfHpText: $('self-hp-text'), selfXp: $('self-xp-fill'), selfXpText: $('self-xp-text'), selfMp: $('self-mp'), selfMpFill: $('self-mp-fill'), selfMpText: $('self-mp-text'), tMp: $('target-mp'), tMpFill: $('target-mp-fill'), tMpText: $('target-mp-text'),
    tFrame: $('target-frame'), tName: $('target-name'), tLevel: $('target-level'), tInitial: $('target-initial'), tHp: $('target-hp-fill'), tLag: $('target-hp-lag'), tHpText: $('target-hp-text'), tSub: $('target-sub'),
    toasts: $('toasts'), conn: $('conn'), connText: $('conn-text'), chatLog: $('chat-log'), chatForm: $('chat-form'), chatInput: $('chat-input'),
    bar: $('actionbar'), death: $('death'), deathTimer: $('death-timer'), deathWait: $('death-wait'), rise: $('rise'), banner: $('zone-banner'), zoneName: $('zone-name'),
  };
  const lag = { self: 1, target: 1, targetId: null };

  // --- action bar: F = the basic strike, 1–6 = the class's skills (skillbar.js fills them) ---
  const slots = [];
  for (let i = 0; i < 7; i++) {
    const b = document.createElement('button');
    b.className = 'slot' + (i ? ' empty' : '');
    b.innerHTML = `<span class="key">${i ? i : 'F'}</span>${i === 0 ? ICONS.sword : '<span class="face"></span>'}<span class="cd"></span><span class="lockat"></span>`;
    b.dataset.tip = i === 0 ? 'Attack — pick a nearby enemy, walk into reach and keep attacking. Press again to stop.' : 'Empty';
    b.addEventListener('click', () => onSlot?.(i));
    el.bar.appendChild(b);
    slots.push({ b, cd: b.querySelector('.cd'), face: b.querySelector('.face'), lockat: b.querySelector('.lockat'), until: 0, len: 1 });
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
  // (chat.js takes over hud.chat and adds channel tabs; this plain version is what runs before it is wired)

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
  const escH = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /** The action-bar skill card (name, unlock, cost, cooldown, who it reaches, what it does). */
  function skillTip(sk) {
    const facts = [sk.mp ? `${fmt(sk.mp)} mana` : '', sk.cd ? `${(sk.cd / 1000).toFixed(sk.cd % 1000 ? 1 : 0)} s cooldown` : '', sk.element && sk.element !== 'physical' ? sk.element : '',
      sk.targets ? '' : sk.ally ? (sk.group ? 'reaches your party' : 'on a friend or yourself') : ''].filter(Boolean).join(' · ');
    // T2/T3/T4 (play-test 5): exactly who it touches, in the rules' own words, and a revive's terms
    const how = sk.ally && !sk.revive ? '<div class="tip-who">To heal someone else: click their party frame (or press T for the next party member), then this key. No one targeted: it lands on you.</div>' : '';
    const who = sk.targets ? `<div class="tip-who">Affects: ${escH(sk.targets)}</div>` : '';
    const rv = sk.revive ? `<div class="tip-who">Revive: ${[sk.revive.mass ? 'every fallen party member near you' : 'one fallen party member', Number.isFinite(sk.revive.hpPct) ? `back at ${Math.round(sk.revive.hpPct * 100)}% health` : '', sk.revive.castMs ? `${(sk.revive.castMs / 1000).toFixed(sk.revive.castMs % 1000 ? 1 : 0)} s cast` : 'instant', sk.revive.combat ? 'works in a fight' : 'out of a fight only'].filter(Boolean).map(escH).join(' · ')}</div>` : '';
    return `<div class="tip-title">${skillIconSvg(sk.id, 26) || ''}${escH(sk.name)}</div>${sk.locked ? `<div class="bad">${escH(sk.lockedText || `Unlocks at level ${sk.level}`)}</div>` : ''}${facts ? `<div class="tip-sub">${escH(facts)}</div>` : ''}${who}${how}${rv}${sk.desc ? `<hr><div>${escH(sk.desc)}</div>` : ''}`;
  }

  return {
    show() { el.hud.hidden = false; },
    setSelf({ name, level, hp, hpMax, xp, next, mp, mpMax }) {
      if (name != null) { el.selfName.textContent = name; el.selfInitial.textContent = (name[0] || '?').toUpperCase(); }
      if (level != null) el.selfLevel.textContent = level;
      if (hp != null && hpMax) { const f = Math.max(0, Math.min(1, hp / hpMax)); el.selfHp.style.width = (f * 100) + '%'; el.selfHpText.textContent = `${fmt(hp)} / ${fmt(hpMax)}`; lag.selfTarget = f; }
      // R6: the bar under health is MANA (the one XP bar sits under the action bar, ui/pt2.js); number on hover
      if (el.selfMp) { const has = mpMax > 0; el.selfMp.hidden = !has; if (has) { const f = Math.max(0, Math.min(1, (mp || 0) / mpMax)); el.selfMpFill.style.width = (f * 100) + '%'; el.selfMpText.textContent = `${fmt(mp)} / ${fmt(mpMax)}`; el.selfMp.dataset.tip = `Mana: ${fmt(mp)} / ${fmt(mpMax)}`; } }
      if (xp != null && next && el.selfXp) { el.selfXp.style.width = Math.min(100, xp / next * 100) + '%'; el.selfXpText.textContent = `${fmt(xp)} / ${fmt(next)} XP`; el.selfXp.parentElement.dataset.tip = `Experience: ${fmt(xp)} / ${fmt(next)}`; }
    },
    setTarget(a) {
      if (!a) { el.tFrame.hidden = true; lag.targetId = null; return; }
      el.tFrame.hidden = false;
      el.tFrame.classList.toggle('hostile', !!a.hostile);
      // S4: rares, elites, mini bosses and bosses get a bigger frame and health bar with their rank on it
      const rk = a.kind === 'monster' && a.rank && a.rank !== 'normal' ? String(a.rank) : '';
      if (el.tFrame.dataset.rank !== rk) { el.tFrame.dataset.rank = rk; el.tFrame.classList.toggle('ranked', !!rk); }
      // R6: the target's mana when the server sends it (party frames / targetVitals), else hidden
      if (el.tMp) { const has = a.mpMax > 0 && !(a.hp <= 0); el.tMp.hidden = !has; if (has) { el.tMpFill.style.width = (Math.max(0, Math.min(1, a.mp / a.mpMax)) * 100) + '%'; el.tMpText.textContent = `${fmt(a.mp)} / ${fmt(a.mpMax)}`; el.tMp.dataset.tip = `Mana: ${fmt(a.mp)} / ${fmt(a.mpMax)}`; } }
      el.tName.textContent = a.name; el.tLevel.textContent = a.level; el.tInitial.textContent = (a.name[0] || '?').toUpperCase();
      const f = Math.max(0, Math.min(1, a.hp / (a.hpMax || 1)));
      el.tHp.style.width = (f * 100) + '%';
      el.tHpText.textContent = a.hp <= 0 ? 'Dead' : `${fmt(a.hp)} / ${fmt(a.hpMax)}`;
      // play-test 2 Q25: a player shows their calling ("Ranger"), town folk their trade — never a blanket "Adventurer"
      const nice = t => String(t || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      el.tSub.textContent = a.kind === 'monster' ? (a.hp <= 0 ? 'Slain' : `${a.rank && a.rank !== 'normal' ? nice(a.rank) + ' · ' : ''}${a.family ? a.family[0].toUpperCase() + a.family.slice(1) : 'Beast'}`)
        : a.kind === 'player' ? (a.formName ? `${a.formName} · ` : '') + (a.clsName || nice(a.look?.cls) || 'Adventurer') : a.pet ? 'Companion' : a.role ? nice(a.role) : 'Townsfolk';
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
    /** Label slots 1..6 from a bar [{ slot, name, desc, level, locked, ally }]. */
    setBar(bar, initials) {
      for (let i = 1; i < slots.length; i++) {
        const found = bar.find(x => x.slot === i), sk = found && !found.empty ? found : null, s = slots[i];
        s.b.classList.toggle('empty', !sk);
        s.b.classList.toggle('locked', !!sk?.locked);
        s.b.classList.toggle('ally', !!sk?.ally);
        // Shared spell pictures for every class; future unknown skills keep their initials.
        if (s.face) { const ico = sk ? skillIconSvg(sk.id, 40) : null; s.face.classList.toggle('has-ico', !!ico); if (ico) { if (s.face.dataset.ico !== sk.id) { s.face.innerHTML = ico; s.face.dataset.ico = sk.id; } } else { delete s.face.dataset.ico; s.face.textContent = sk ? initials(sk.name) : ''; } }
        // play-test 6 U11: a locked key says WHEN it opens, on the key itself ("my heal did nothing" was a level-3 skill at level 2)
        if (s.lockat) s.lockat.textContent = sk?.locked ? `Lv ${sk.level}` : '';
        // P5: a rich skill card on the shared tooltip (readable while a key is held)
        delete s.b.dataset.tip;
        s.b.dataset.tipHtml = sk ? skillTip(sk) : `<div class="tip-sub">${escH(found?.desc || 'Empty')}</div>`;
      }
    },
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
