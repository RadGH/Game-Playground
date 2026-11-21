// The play HUD. One row of hero panels ABOVE the street (portrait from the 3D model, name, level, lives, health + mana
// with numbers, both spells with a cooldown sweep, mana cost and this player's key, Breaker with its key) — fixed
// height: nothing that comes and goes changes it. Over the top edge of the street (owner #91: the street must never
// change size when a bar appears) a see-through info row — the speech strip (story lines, queued, never the same line
// twice at once — rule 42), the last enemy hit and the boss bar (name, title, phase marks) — with the level-up banner
// stacked under it. Elsewhere on the street only small things at its edges: GO →, arrows to heroes and enemies off
// screen, at most three loot toasts. Updated in place every frame (no redraws — lessons H3).
import { icon } from './icons.js';
import { esc, itemName, rarityName, rarityColor } from './text.js';
import { hp as n } from '../../../../shared/format.js';
import { keyLabel } from '../input/bindings.js';
import { hintScheme } from './party.js';

const LINE_TIME = 3.4;

export function createHud(app, session, partyIn, root) {
  let party = partyIn;
  const { data } = app;
  const G = () => session.G;
  const top = root.querySelector('.wr-hud-top .wr-panels'), info = root.querySelector('.wr-hud-info'), stage = root.querySelector('.wr-stage'), stageTop = root.querySelector('.wr-stage-top');
  const slotOf = pid => party.find(s => s.pid === pid) || { pid, device: 'kb', color: '#ccc' };
  const panels = new Map();
  const touchOn = () => root.classList.contains('wr-touch-on');

  // ---------------------------------------------------------- hero panels
  function buildPanels() {
    top.innerHTML = '';
    panels.clear();
    for (const h of G().heroes) {
      const s = slotOf(h.pid);
      const el = document.createElement('div');
      el.className = `wr-hp${s.bot || h.ctrl === 'bot' ? ' wr-hp-bot' : ''}`;
      el.style.setProperty('--pc', s.color || '#ccc');
      el.innerHTML = `<div class="wr-portrait wr-portrait-sm"><span class="wr-portrait-wait"></span></div>
        <div class="wr-hp-main">
          <p class="wr-hp-name"><b>${esc(h.name)}</b><span class="wr-hp-lv"></span><span class="wr-hp-lives"></span></p>
          <div class="wr-meter wr-meter-hp"><i></i><span></span></div>
          <div class="wr-meter wr-meter-mp"><i></i><span></span></div>
          <p class="wr-hp-note"></p>
        </div>
        <div class="wr-hp-acts">${[0, 1].map(k => `<div class="wr-sp" data-sp="${k}"><span class="wr-sp-ic"></span><i class="wr-sp-cd"></i><small class="wr-sp-mp"></small><kbd></kbd></div>`).join('')}
          <div class="wr-sp wr-sp-brk" data-sp="b">${icon('breaker')}<small class="wr-sp-mp">Breaker</small><kbd></kbd></div></div>`;
      top.append(el);
      const P = { el, h, s, last: {}, q: sel => el.querySelector(sel) };
      P.lv = P.q('.wr-hp-lv'); P.lives = P.q('.wr-hp-lives'); P.hpI = P.q('.wr-meter-hp i'); P.hpT = P.q('.wr-meter-hp span'); P.mpI = P.q('.wr-meter-mp i'); P.mpT = P.q('.wr-meter-mp span'); P.note = P.q('.wr-hp-note');
      P.sp = [0, 1].map(k => ({ el: P.q(`[data-sp="${k}"]`), ic: P.q(`[data-sp="${k}"] .wr-sp-ic`), cd: P.q(`[data-sp="${k}"] .wr-sp-cd`), mp: P.q(`[data-sp="${k}"] .wr-sp-mp`), kbd: P.q(`[data-sp="${k}"] kbd`) }));
      P.brkKbd = P.q('.wr-sp-brk kbd');
      panels.set(h.id, P);
      app.portrait({ look: h.look || app.heroLook({ cls: h.cls, look: {}, gear: h.gear }) }, 96).then(url => { if (url) P.q('.wr-portrait').innerHTML = `<img src="${url}" alt="">`; });
    }
    keys();
  }
  /** Every key hint follows the device each player is using right now (rule 18). */
  function keys() {
    for (const P of panels.values()) {
      const sch = P.s.bot || P.h.ctrl === 'bot' ? 'touch' : hintScheme(P.s, app.input.last);
      const hide = sch === 'touch';
      P.sp[0].kbd.textContent = hide ? '' : keyLabel(sch, 'spell1');
      P.sp[1].kbd.textContent = hide ? '' : keyLabel(sch, 'spell2');
      P.brkKbd.textContent = hide ? '' : (sch === 'pad' ? 'Back' : keyLabel(sch, 'breaker'));
      P.el.classList.toggle('wr-hp-nokeys', hide);
    }
  }
  const offDev = app.input.onDevice(keys);
  const set = (P, k, v, fn) => { if (P.last[k] !== v) { P.last[k] = v; fn(v); } };

  function updatePanels() {
    for (const h of G().heroes) {
      const P = panels.get(h.id); if (!P) continue;
      set(P, 'lv', h.level, v => { P.lv.textContent = `Level ${n(v)}`; });
      set(P, 'lives', h.lives, v => { P.lives.textContent = `Lives ${n(Math.max(0, v))}`; P.lives.classList.toggle('wr-low', v <= 1); });
      const hp = Math.max(0, Math.round(h.hp)), mp = Math.max(0, Math.round(h.mp));
      set(P, 'hp', `${hp}/${h.max}`, () => { P.hpI.style.width = `${Math.max(0, Math.min(100, hp / h.max * 100))}%`; P.hpT.textContent = `${n(hp)} / ${n(h.max)}`; P.el.classList.toggle('wr-hp-low', hp < h.max * 0.3); });
      set(P, 'mp', `${mp}/${h.mpMax}`, () => { P.mpI.style.width = `${Math.max(0, Math.min(100, mp / h.mpMax * 100))}%`; P.mpT.textContent = `${n(mp)} / ${n(h.mpMax)}`; });
      h.spells.forEach((id, k) => {
        const S = data.classes.spells[id], E = P.sp[k];
        if (!S) { set(P, `s${k}`, 'none', () => { E.el.className = 'wr-sp wr-sp-none'; E.ic.innerHTML = ''; E.mp.textContent = ''; }); return; }
        const locked = S.level > h.level, cd = Math.max(0, h.cds?.[id] || 0), frac = locked ? 0 : cd / S.cd;
        set(P, `s${k}`, `${id}|${locked}`, () => { E.ic.innerHTML = icon(locked ? 'lock' : id); E.mp.textContent = locked ? `Level ${n(S.level)}` : `${n(S.mp)} mana`; E.el.dataset.name = S.name; });
        E.el.classList.toggle('wr-sp-locked', locked);
        E.el.classList.toggle('wr-sp-nomp', !locked && h.mp < S.mp);
        E.el.classList.toggle('wr-sp-ready', !locked && cd <= 0 && h.mp >= S.mp);
        set(P, `c${k}`, Math.round(frac * 40), v => { E.cd.style.setProperty('--cd', v / 40); });
      });
      // the note line: down / reviving / out of lives / holding a road weapon
      let note = '', cls = '';
      if (h.state === 'gone') { note = 'Out of lives'; cls = 'wr-bad'; }
      else if (h.state === 'out') {
        const partner = G().heroes.some(o => o !== h && !['out', 'gone', 'dead'].includes(o.state)) || G().foes.some(f => f.side === 'ally' && f.state !== 'dead');
        note = h.reviveT > 0.05 ? `Getting up… ${n(Math.round(h.reviveT / app.T.reviveTime * 100))}%` : partner ? `Down: stand by them to help up · ${n(Math.ceil(Math.max(0, h.downClock)))} s` : `Down: back in ${n(Math.ceil(Math.max(0, h.downClock)))} s`;
        cls = 'wr-bad';
      } else if (h.pickup) { const pk = data.chapters.pickups[h.pickup.id]; note = `${pk?.name || 'Road weapon'}: ${n(h.pickup.uses)} swings left · Heavy throws it`; }
      set(P, 'note', note + cls, () => { P.note.textContent = note; P.note.className = `wr-hp-note ${cls}`; });
      P.el.classList.toggle('wr-hp-out', h.state === 'out' || h.state === 'gone');
    }
  }

  // ---------------------------------------------------------- the info row: speech strip, last enemy, boss
  info.innerHTML = `<div class="wr-speech" hidden><div class="wr-portrait wr-portrait-xs"></div><p><b></b><span></span></p></div>
    <div class="wr-foebar" hidden><p><b></b><span></span></p><div class="wr-meter wr-meter-foe"><i></i></div></div>
    <div class="wr-bosses" hidden></div>`;
  const sp = { el: info.querySelector('.wr-speech'), face: info.querySelector('.wr-speech .wr-portrait'), who: info.querySelector('.wr-speech b'), text: info.querySelector('.wr-speech span') };
  const queue = [], said = new Set(); let speaking = null, speakT = 0;
  function sayLine(id) {
    const lines = data.story.lines[id]; if (!lines) return;
    for (const [who, text] of lines) { const key = `${id}|${text}`; if (said.has(key) || queue.some(q => q.key === key) || speaking?.key === key) continue; queue.push({ key, who, text }); }
  }
  function speaker(who) {
    if (who === 'hero') { const h = G().heroes.find(x => x.ctrl !== 'bot') || G().heroes[0]; return { name: h?.name || 'You', spec: h?.look ? { look: h.look } : null }; }
    const s = data.story.speakers[who] || { name: 'Someone' };
    if (s.boss) { const b = data.enemies.bosses[s.boss]; return { name: s.name, spec: b?.body === 'creature' ? { creature: b.look } : { look: b?.look } }; }
    return { name: s.name, spec: s.look ? { look: s.look } : null, voice: !s.look };
  }
  function updateSpeech(dt) {
    if (speaking) { speakT -= dt; if (speakT > 0) return; said.add(speaking.key); speaking = null; sp.el.hidden = true; }
    const q = queue.shift(); if (!q) return;
    speaking = q; speakT = LINE_TIME + q.text.length / 40;
    const who = speaker(q.who);
    sp.who.textContent = who.name; sp.text.textContent = q.text; sp.el.hidden = false; sp.el.classList.toggle('wr-speech-voice', !!who.voice);
    sp.face.innerHTML = who.voice ? '<span class="wr-voice-mark"></span>' : '';
    if (who.spec) app.portrait(who.spec, 96).then(url => { if (url && speaking === q) sp.face.innerHTML = `<img src="${url}" alt="">`; });
  }

  const fb = { el: info.querySelector('.wr-foebar'), name: info.querySelector('.wr-foebar b'), hp: info.querySelector('.wr-foebar span'), bar: info.querySelector('.wr-meter-foe i') };
  // boss bars: one per boss on the street, stacked (a boss pair shows two — owner batch 2); all over the street, so a
  // second bar never moves anything. A boss that calms down (Ossmara, Maddened) says so on its bar, never "defeated".
  const bossBox = info.querySelector('.wr-bosses');
  const bosses = [];                 // { id, el, bar, calm, goneT }
  function addBoss(e) {
    if (!e.partnerOf) { bosses.length = 0; bossBox.innerHTML = ''; }
    if (bosses.some(b => b.id === e.id)) return;
    const el = document.createElement('div');
    el.className = 'wr-bossbar';
    el.innerHTML = `<p><b>${esc(e.name || 'Boss')}</b><span>${esc(e.title || '')}</span></p><div class="wr-meter wr-meter-boss"><i></i><em>${((data.enemies.bosses[e.boss] || {}).phases || []).map(p => `<s style="left:${p * 100}%"></s>`).join('')}</em></div>`;
    bossBox.append(el);
    bosses.push({ id: e.id, el, bar: el.querySelector('i'), calm: false, goneT: 0 });
  }
  let foeId = null, foeT = 0;
  function updateBars(dt) {
    const g = G();
    for (const B of [...bosses]) {
      const f = g.foes.find(x => x.id === B.id);
      if (f && f.state === 'calm' && !B.calm) { B.calm = true; B.el.classList.add('wr-boss-calm'); B.el.querySelector('span').textContent = 'Calm: the fight is over'; B.goneT = 3; }
      if (f && !B.calm && f.state !== 'dead') B.bar.style.width = `${Math.max(0, f.hp / f.max * 100)}%`;
      if ((!f || f.state === 'dead') && !B.goneT) B.goneT = 0.6;
      if (B.goneT) { B.goneT -= dt; if (B.goneT <= 0) { B.el.remove(); bosses.splice(bosses.indexOf(B), 1); } }
    }
    bossBox.hidden = !bosses.length;
    foeT -= dt;
    const f = foeId != null && g.foes.find(x => x.id === foeId);
    if (f && !bosses.some(B => B.id === f.id) && (f.state !== 'dead' || foeT > 1.5) && foeT > 0) {
      fb.el.hidden = false; fb.name.textContent = f.name; fb.hp.textContent = `${n(Math.max(0, f.hp))} / ${n(f.max)}`;
      fb.bar.style.width = `${Math.max(0, f.hp / f.max * 100)}%`;
    } else fb.el.hidden = true;
    info.classList.toggle('wr-info-empty', sp.el.hidden && fb.el.hidden && bossBox.hidden);   // an overlay: changes no layout
  }

  // ---------------------------------------------------------- the stage edges: GO, pointers, toasts, banner
  stage.insertAdjacentHTML('beforeend', `<div class="wr-go" hidden><b>GO</b>${icon('next')}</div><div class="wr-pointers"></div><div class="wr-toasts" aria-live="polite"></div>`);
  stageTop.insertAdjacentHTML('beforeend', '<div class="wr-banner" hidden></div>');
  const goEl = stage.querySelector('.wr-go'), ptrBox = stage.querySelector('.wr-pointers'), toasts = stage.querySelector('.wr-toasts'), banner = stageTop.querySelector('.wr-banner');
  let goT = 0, bannerT = 0;
  const pool = [];
  function updatePointers() {
    const g = G(), W = stage.clientWidth, H = stage.clientHeight; let k = 0;
    const want = [...g.heroes.filter(h => h.state !== 'gone').map(h => ({ e: h, c: slotOf(h.pid).color || '#ccc', hero: true })),
      ...g.foes.filter(f => f.team === 1 && f.state !== 'dead' && f.state !== 'enter').map(f => ({ e: f, c: '#e0645a', hero: false }))];
    for (const w of want) {
      const p = app.view.project(w.e.x, (w.e.y || 0) + 1, w.e.z);
      if (!p || (p.x >= 8 && p.x <= W - 8)) continue;
      if (!Number.isFinite(p.x) || p.x === -1 && p.y === -1) continue;
      const el = pool[k] || (pool[k] = Object.assign(document.createElement('i'), { className: 'wr-ptr' }));
      if (!el.isConnected) ptrBox.append(el);
      const left = p.x < 8;
      el.className = `wr-ptr ${left ? 'wr-ptr-l' : 'wr-ptr-r'}${w.hero ? ' wr-ptr-hero' : ''}`;
      el.style.setProperty('--pc', w.c); el.style.top = `${Math.max(14, Math.min(H - 14, p.y))}px`;
      el.hidden = false; k++;
      if (k >= 12) break;
    }
    for (let i = k; i < pool.length; i++) pool[i].hidden = true;
  }
  const lastToast = new Map();
  function toast(html, color, key = null) {
    if (key && lastToast.get(key)?.isConnected) { const t = lastToast.get(key); t.innerHTML = html; t.dataset.t = performance.now(); return; }
    const t = document.createElement('div'); t.className = 'wr-toast'; t.style.setProperty('--tc', color); t.innerHTML = html; t.dataset.t = performance.now();
    toasts.append(t); if (key) lastToast.set(key, t);
    while (toasts.children.length > 3) toasts.firstElementChild.remove();
  }
  const goldSum = new Map();
  function showBanner(text, sub = '') { banner.innerHTML = `<b>${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`; banner.hidden = false; bannerT = 2.6; }

  // ---------------------------------------------------------- events
  const heroById = id => G().heroes.find(h => h.id === id);
  function handle(events) {
    const multi = G().heroes.length > 1;
    for (const e of events) {
      switch (e.type) {
        case 'line': sayLine(e.line); break;
        case 'boss': addBoss(e); break;
        case 'calm': { const f = G().foes.find(x => x.id === e.id), nm = f?.name || data.enemies.bosses[e.kind]?.name || 'The wyrm'; showBanner(`${nm.split(',')[0]} calms`, 'The fight is over'); break; }
        case 'hit': { const by = heroById(e.by); if (by && G().foes.some(f => f.id === e.id && f.team === 1)) { foeId = e.id; foeT = 4; } break; }
        case 'go': goT = 5; goEl.hidden = false; break;
        case 'fight': goT = 0; goEl.hidden = true; break;
        case 'loot': {
          const h = G().heroes.find(x => x.pid === e.pid); if (!h || h.ctrl === 'bot') break;
          toast(`${app.render?.itemIconHtml(data, e.item, 28) || ''}${multi ? `<em>${esc(h.name)}</em> ` : ''}<b>${esc(itemName(data.items, e.item))}</b> <span>${esc(rarityName(data.items, e.item))}</span>`, rarityColor(data.items, e.item));
          break;
        }
        case 'gold': {
          const h = G().heroes.find(x => x.pid === e.pid); if (!h || h.ctrl === 'bot') break;
          const g = (goldSum.get(e.pid) || 0) + e.amount; goldSum.set(e.pid, g);
          toast(`${icon('gold')}<b>+${n(g)} gold</b>${multi ? ` <em>${esc(h.name)}</em>` : ''}`, '#f0c050', `gold${e.pid}`);
          break;
        }
        case 'levelUp': {
          const h = heroById(e.id) || G().heroes.find(x => x.pid === e.pid); if (!h) break;
          // what this level brought: a new spell (the sim names it; older events: looked up by level) and a new
          // dash / block move (round 2 class kit — `learnedMove`)
          const spell = data.classes.classes[h.cls].spells.map(id => [id, data.classes.spells[id]]).find(([, S]) => S.level === e.level);
          const spellName = e.learnedSpell || spell?.[1].name || null;
          const unslotted = spell && !h.spells.includes(spell[0]);
          const parts = [];
          if (spellName) parts.push(`Learned ${spellName}${unslotted ? ' (put it in a slot from Spells)' : ''}`);
          if (e.learnedMove) parts.push(`New move: ${e.learnedMove}`);
          showBanner(`${h.name} reached level ${n(e.level)}`, parts.join(' · ') || `Health ${n(h.max)}, mana ${n(h.mpMax)}`);
          break;
        }
        case 'pickup': { const pk = data.chapters.pickups[e.pickup]; const h = heroById(e.id); if (pk && h) toast(`${icon('weapon')}<b>${esc(pk.name)}</b> <span>${multi ? esc(h.name) : 'picked up'}</span>`, '#d8c8a0'); break; }
        case 'nomana': { const P = panels.get(e.id); if (P) { const k = P.h.spells.indexOf(e.spell); P.sp[k]?.el.classList.add('wr-sp-shake'); setTimeout(() => P.sp[k]?.el.classList.remove('wr-sp-shake'), 350); } break; }
      }
    }
  }
  function note(n2) { if (n2.kind === 'bagFull') toast(`${icon('bag')}<b>Bag full</b> <span>${esc(itemName(data.items, n2.item))} sold for ${n(n2.gold)} gold</span>`, '#c8c4bc'); }

  buildPanels();
  let goldClock = 0;
  return {
    handle, note, keys, rebuild(p) { if (p) party = p; buildPanels(); },
    update(dt) {
      updatePanels(); updateSpeech(dt); updateBars(dt); updatePointers();
      if (goT > 0) { goT -= dt; if (goT <= 0 || G().phase === 'fight') goEl.hidden = true; }
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.hidden = true; }
      const now = performance.now();
      for (const t of [...toasts.children]) if (now - +t.dataset.t > 3200) t.remove();
      goldClock += dt; if (goldClock > 2.5) { goldClock = 0; goldSum.clear(); }
    },
    destroy() { offDev(); },
    get speaking() { return speaking?.text || null; },
  };
}
