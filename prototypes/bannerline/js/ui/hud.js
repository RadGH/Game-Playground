// Match HUD (PLAN §17): top bar, rival strip, alerts, gate preview, talent pick, pause menu,
// scoreboard. The bottom control bar is js/ui/controlbar.js. Everything reads through query.js
// (docs/interfaces.md §7) and acts through seat.issue() — never writes sim state.

import { h, setText, setStyle, toggle, setTip, clockText, shortSecs } from './dom.js';
import { icon } from './icons.js';
import { TEAM_CSS } from '../view/terrain.js';
import { createMenuNav } from './menunav.js';

const DMG_NAMES = { blade: 'Blade', pierce: 'Pierce', fire: 'Fire', nature: 'Nature' };
const ARMOUR_NAMES = { light: 'Light', heavy: 'Heavy', spectral: 'Spectral', hide: 'Hide', fortified: 'Fortified' };
const REJECT_TEXT = {
  gold: 'Not enough gold', stock: 'Out of stock — wait for a restock', locked: 'That tier is not open yet',
  roster: 'Not in your army', dead: 'Your hero is down', cooldown: 'Not ready yet', mana: 'Not enough mana',
  rank: 'Learn that skill first (Ctrl + key)', points: 'No skill points', maxRank: 'Already at full rank',
  level: 'Needs hero level 6', notAtShop: 'Walk to the Outfitter to buy or sell', full: 'Your six item slots are full', uniqueEquipped: 'Unique: you can carry only one', notUsable: 'That item works while carried', ownFieldOnly: 'Defensive powers land in your own field', enemyFieldOnly: 'Offensive powers land in an enemy field', notInField: 'Powers land inside a field', max: 'Fully trained', maxLevel: 'Fully trained',
  over: 'The match is over', bad: 'Cannot do that', stunned: 'Stunned',
};
export { DMG_NAMES, ARMOUR_NAMES };

export function createHud({ root, overlay, sim, Q, player, seat, project, onPause, onSurrender, onQuit, onHowTo = null, isPad = false }) {
  const data = sim.data;
  const tickHz = data.econ?.clock?.tickHz || 20;
  const me = () => sim.state.players[player];
  const myTeam = me().team;
  const enemyTeam = sim.state.teams.find((t) => t.id !== myTeam)?.id ?? 1;

  root.replaceChildren();
  // ---------- top bar ----------
  const top = h('div', 'topbar', null, { 'data-ui': true });
  const banL = bannerBlock(myTeam, 'You');
  const banR = bannerBlock(enemyTeam, 'Rival');
  const econ = h('div', 'tb-econ');
  econ.innerHTML = `
    <div class="tb-stat gold" data-tip="Gold. Hire units at the Barracks (B), buy items at the Outfitter (O), train your army at the Drill Yard (U) and buy powers at the Sanctum (P).">${icon('coin')}<b class="v"></b></div>
    <div class="tb-stat income" data-tip="Income: paid every Pay. Every send you buy raises it.">${icon('income')}<b class="v"></b></div>
    <div class="pay-ring" data-tip="Pay: gold arrives and your queued sends march when the ring fills.">
      <svg viewBox="0 0 40 40"><circle class="track" cx="20" cy="20" r="16"/><circle class="fill" cx="20" cy="20" r="16"/></svg>
      <span class="pay-t"></span><span class="pay-l">Pay</span>
    </div>`;
  const mid = h('div', 'tb-clock');
  mid.innerHTML = `<div class="clock-v"></div><div class="clock-sub"></div>`;
  const tide = h('div', 'tb-tide');
  tide.innerHTML = `
    <div class="tide-ring" data-tip="Tide: neutral raiders enter both fields on a timer and grow every wave.">
      <svg viewBox="0 0 40 40"><circle class="track" cx="20" cy="20" r="16"/><circle class="fill" cx="20" cy="20" r="16"/></svg>
      ${icon('waves', 'tide-ic')}
    </div>
    <div class="tide-txt"><b class="tide-lv"></b><span class="tide-in"></span></div>
    <div class="rising" hidden>${icon('rise')}<span></span></div>`;
  top.append(banL.el, econ, mid, tide, banR.el);
  root.append(top);

  function bannerBlock(team, label) {
    const el = h('div', 'tb-banners ' + (team === myTeam ? 'mine' : 'theirs'));
    el.style.setProperty('--team', TEAM_CSS[team] || '#888');
    el.innerHTML = `
      <div class="ban-head">${icon('flag')}<span class="ban-label">${label}</span><b class="ban-v"></b><span class="rally" hidden data-tip="">${icon('rally')}<i></i></span></div>
      <div class="ban-bar"><div class="ban-fill"></div><div class="ban-ghost"></div></div>`;
    return { el, v: el.querySelector('.ban-v'), fill: el.querySelector('.ban-fill'), ghost: el.querySelector('.ban-ghost'), rally: el.querySelector('.rally'), ghostF: 1 };
  }

  // ---------- rival strip ----------
  const rival = h('div', 'rival', null, { 'data-ui': true });
  rival.innerHTML = `
    <div class="rv-portrait"><span class="rv-lv"></span></div>
    <div class="rv-body">
      <div class="rv-name"></div>
      <div class="rv-hp"><div></div></div>
      <div class="rv-tags"><span class="tag dmg"></span><span class="tag arm"></span></div>
      <div class="rv-deck"></div>
    </div>`;
  root.append(rival);
  const rvDeck = rival.querySelector('.rv-deck');

  // ---------- army chip: your sends in the enemy field + the gate queue (click = look there) ----------
  const army = h('button', 'army-chip', null, { type: 'button', 'data-ui': true });
  army.innerHTML = `${icon('sword')}<span class="ar-main"><b class="ar-n">0</b> fighting</span><span class="ar-wait"></span><span class="ar-dealt"></span>`;
  root.append(army);
  let onArmyClick = null;
  army.addEventListener('click', () => onArmyClick?.());

  // ---------- alerts + reject line ----------
  const alerts = h('div', 'alerts');
  const reject = h('div', 'reject');
  root.append(alerts, reject);
  let rejectT = 0;
  function alert(text, kind = 'info', ms = 2600) {
    const el = h('div', 'alert ' + kind, text);
    alerts.append(el);
    while (alerts.children.length > 4) alerts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
  }

  // ---------- gate preview (in the overlay, anchored to my field's gate) ----------
  const gate = h('div', 'gate-preview');
  overlay.append(gate);

  // ---------- talent pick ----------
  const talent = h('div', 'talent-pick', null, { 'data-ui': true, hidden: true });
  root.append(talent);
  let talentShown = false;

  // ---------- pause + scoreboard ----------
  const pause = h('div', 'pause-menu', null, { 'data-ui': true, hidden: true });
  pause.innerHTML = `<div class="pause-card"><h2>Paused</h2>
    <button class="menu-btn primary" data-act="resume">Resume <kbd>Esc</kbd></button>
    <button class="menu-btn" data-act="howto">How to play</button>
    <button class="menu-btn" data-act="surrender">Surrender</button>
    <button class="menu-btn" data-act="quit">Leave to the lobby</button>
    <p class="keys"><kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> confirm · controller: d-pad, <kbd class="pad">A</kbd>, <kbd class="pad">B</kbd><br>Right-click move / attack · <kbd>A</kbd> attack-move · <kbd>S</kbd> stop · <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>D</kbd><kbd>R</kbd> skills at the cursor · <kbd>Ctrl</kbd>+key learn ·
    <kbd>B</kbd> Barracks (hire units, hold to keep hiring) · <kbd>O</kbd> Outfitter · <kbd>U</kbd> Drill Yard · <kbd>P</kbd> Sanctum · <kbd>1</kbd>–<kbd>6</kbd> use items · <kbd>F</kbd> look at the next field · <kbd>Space</kbd> back to your hero · wheel zoom</p></div>`;
  root.append(pause);
  pause.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'resume') setPaused(false);
    if (act === 'surrender') { setPaused(false); onSurrender(); }
    if (act === 'howto') { setPaused(false); onHowTo?.(); }
    if (act === 'quit') { setPaused(false); onQuit(); }
  });
  let paused = false;
  const pauseNav = createMenuNav(pause, { onBack: () => setPaused(false) });
  const talentNav = createMenuNav(talent, { selector: '.tp-card' });
  function setPaused(v) {
    paused = v; pause.hidden = !v; onPause(v);
    if (v) pauseNav.focus('[data-act="resume"]');
  }

  const board = h('div', 'scoreboard', null, { hidden: true });
  root.append(board);

  // ---------- update ----------
  function update(dt) {
    const s = sim.state;
    const c = Q.clock(s, data);
    const p = me();
    setText(econ.querySelector('.gold .v'), Math.floor(p.gold));
    setText(econ.querySelector('.income .v'), '+' + Math.round(p.income));
    const ring = econ.querySelector('.pay-ring .fill');
    setStyle(ring, 'stroke-dashoffset', String(100.5 * (1 - (c.payProgress ?? 0))));
    setText(econ.querySelector('.pay-t'), shortSecs(c.payIn / tickHz));
    setText(mid.querySelector('.clock-v'), clockText(c.seconds));
    let sub = '';
    if (c.nextUnlock) sub = `Tier ${c.nextUnlock.tier} in ${clockText(c.nextUnlock.inTicks / tickHz)}`;
    else if (!c.rising && c.risingIn != null) sub = `Rising Tide in ${clockText(c.risingIn / tickHz)}`;
    else if (c.capIn != null) sub = `Final call in ${clockText(c.capIn / tickHz)}`;
    setText(mid.querySelector('.clock-sub'), sub);
    const tideEvery = (data.econ?.clock?.tide || 40) * tickHz;
    setStyle(tide.querySelector('.tide-ring .fill'), 'stroke-dashoffset', String(100.5 * (c.tideIn / tideEvery)));
    setText(tide.querySelector('.tide-lv'), `Tide ${c.tideLevel + 1}`);
    setText(tide.querySelector('.tide-in'), `in ${shortSecs(c.tideIn / tickHz)}s`);
    const rs = tide.querySelector('.rising');
    rs.hidden = !c.rising;
    if (c.rising) setText(rs.querySelector('span'), `Rising Tide ${c.rising}`);

    for (const [blk, teamId] of [[banL, myTeam], [banR, enemyTeam]]) {
      const ti = Q.teamInfo(s, data, teamId);
      const f = ti.bannersMax ? Math.max(0, ti.banners / ti.bannersMax) : 0;
      setText(blk.v, Math.max(0, Math.ceil(ti.banners)));
      setStyle(blk.fill, 'width', (f * 100).toFixed(2) + '%');
      blk.ghostF += (f - blk.ghostF) * Math.min(1, dt * 1.5);
      if (blk.ghostF < f) blk.ghostF = f;
      setStyle(blk.ghost, 'width', (blk.ghostF * 100).toFixed(2) + '%');
      toggle(blk.el, 'low', f < 0.25);
      const rallyOn = ti.rally > 0;
      blk.rally.hidden = !rallyOn;
      if (rallyOn) { setText(blk.rally.querySelector('i'), `+${Math.round(ti.rally * 100)}%`); setTip(blk.rally, `Rally: +${Math.round(ti.rally * 100)}% bounty and XP while behind on banners.`); }
    }

    // Rival strip.
    const rv = Q.rivalInfo(s, data, player);
    if (rv) {
      setText(rival.querySelector('.rv-name'), `${rv.name} · ${rv.heroName || rv.hero}`);
      setText(rival.querySelector('.rv-lv'), rv.level);
      setStyle(rival.querySelector('.rv-hp > div'), 'width', (Math.max(0, rv.hpPct) * 100).toFixed(1) + '%');
      toggle(rival, 'down', rv.hpPct <= 0);
      setText(rival.querySelector('.tag.dmg'), DMG_NAMES[rv.dmgType] || rv.dmgType);
      setText(rival.querySelector('.tag.arm'), ARMOUR_NAMES[rv.armourClass] || rv.armourClass);
      rival.querySelector('.tag.dmg').dataset.type = rv.dmgType;
      setTip(rival.querySelector('.tag.dmg'), `Deals ${DMG_NAMES[rv.dmgType] || rv.dmgType} damage. Send units whose armour shrugs it off.`);
      setTip(rival.querySelector('.tag.arm'), `Wears ${ARMOUR_NAMES[rv.armourClass] || rv.armourClass} armour.`);
      const deck = rv.deck || [];
      if (rvDeck.children.length !== deck.length) {
        rvDeck.replaceChildren(...deck.map(() => h('div', 'rv-send')));
        [...rvDeck.children].forEach((el) => { el.innerHTML = '<span class="n"></span><i></i>'; });
      }
      deck.forEach((d, i) => {
        const el = rvDeck.children[i];
        setText(el.querySelector('.n'), (d.name || d.unit || '?').split(' ').map((w) => w[0]).join('').slice(0, 2));
        setStyle(el.querySelector('i'), 'width', ((d.max ? d.stock / d.max : 0) * 100).toFixed(0) + '%');
        setTip(el, `${d.name || d.unit}: ${d.stock}/${d.max} in stock${d.auto ? ' · auto' : ''}`);
        toggle(el, 'auto', !!d.auto);
      });
    }

    // Gate preview over my field's gate: what my rival has queued for the next Pay.
    const myField = sim.map.fields.find((f) => f.team === myTeam);
    const gp = Q.gatePreview(s, data, myField.id) || [];
    const g0 = myField.gates[0];
    const pt = project(g0.x, 4.5, g0.z);
    if (pt && pt.visible && gp.length) {
      gate.hidden = false;
      setStyle(gate, 'transform', `translate(${pt.x.toFixed(0)}px, ${pt.y.toFixed(0)}px) translate(-50%, -100%)`);
      const key = gp.map((g) => g.unit + 'x' + g.count).join(',') + '|' + Math.ceil(c.payIn / tickHz);
      if (gate._k !== key) {
        gate._k = key;
        gate.innerHTML = `<div class="gp-head">Next Pay · ${shortSecs(c.payIn / tickHz)}s</div><div class="gp-list">${gp.map((g) => {
          const u = data.units.units[g.unit];
          return `<span class="gp-unit t${u?.tier || 1}" title="${u?.name || g.unit}">${initials(u?.name || g.unit)}<b>${g.count > 1 ? '×' + g.count : ''}</b></span>`;
        }).join('')}</div>`;
      }
    } else gate.hidden = true;

    // Talent pick.
    const hi = Q.heroInfo(s, data, player);
    const open = !!hi?.talent?.open;
    if (open && !talentShown) {
      talentShown = true;
      talent.hidden = false;
      talent.innerHTML = `<div class="tp-head">Choose a talent</div><div class="tp-row">${hi.talent.choices.map((ch, i) => `
        <button class="tp-card" data-choice="${i}"><b>${ch.name}</b><span>${ch.desc || ''}</span>${isPad ? '' : `<kbd>${i === 0 ? 'F1' : 'F2'}</kbd>`}</button>`).join('')}</div>${isPad ? '<div class="tp-pad">Press <kbd class="pad">View</kbd> to choose</div>' : ''}`;
    } else if (!open && talentShown) { talentShown = false; talent.hidden = true; }

    // Army chip.
    {
      let fighting = 0, waiting = 0;
      for (const e of s.ents) if (e.kind === 'unit' && e.owner === player && e.alive !== false) fighting++;
      for (const f of s.fields || []) for (const w of f.waiting || []) if (w.owner === player) waiting += w.bodies || 1;
      if (Array.isArray(s.gateQueue)) for (const w of s.gateQueue) if (w.owner === player) waiting += w.bodies || 1;
      setText(army.querySelector('.ar-n'), fighting);
      setText(army.querySelector('.ar-wait'), waiting ? `+${waiting} waiting at the gate` : '');
      const dealt = p.stats?.dealt || 0;
      setText(army.querySelector('.ar-dealt'), dealt ? `${Math.round(dealt * 10) / 10} banners torn` : '');
      toggle(army, 'idle', fighting === 0 && waiting === 0);
      setTip(army, 'Your units in the rival\'s field. Click (or F) to watch them.');
    }

    if (rejectT > 0) { rejectT -= dt; if (rejectT <= 0) reject.classList.remove('show'); }
    if (!board.hidden) drawBoard();
  }

  talent.addEventListener('click', (e) => {
    const b = e.target.closest('[data-choice]'); if (!b) return;
    seat.issue({ type: 'talent', choice: Number(b.dataset.choice) });
  });
  const onKey = (e) => {
    if (!talentShown || isPad) return;
    if (e.code === 'F1' || e.code === 'F2') { e.preventDefault(); seat.issue({ type: 'talent', choice: e.code === 'F1' ? 0 : 1 }); }
  };
  window.addEventListener('keydown', onKey);

  function drawBoard() {
    const s = sim.state;
    board.innerHTML = `<table><thead><tr><th>Player</th><th>Hero</th><th>Lv</th><th>Income</th><th>Sends</th><th>Kills</th><th>Deaths</th><th>Leaked</th></tr></thead><tbody>${
      s.players.map((p) => `<tr style="--team:${TEAM_CSS[p.team]}"><td>${p.name}</td><td>${data.heroes?.heroes?.[p.hero]?.name || p.hero}</td><td>${p.level}</td><td>${Math.round(p.income)}</td><td>${p.stats.sends}</td><td>${p.stats.kills}</td><td>${p.stats.deaths}</td><td>${Math.round(p.stats.leaked * 10) / 10}</td></tr>`).join('')
    }</tbody></table>`;
  }

  function initials(name) { return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }

  function onEvent(ev) {
    const s = sim.state;
    switch (ev.type) {
      case 'reject':
        if (ev.player === player) { setText(reject, REJECT_TEXT[ev.reason] || ev.reason); reject.classList.add('show'); rejectT = 1.6; }
        break;
      case 'leak': {
        const n = Math.round(ev.banners * 10) / 10;
        if (ev.team === myTeam) alert(`Leak! −${n} banner${n === 1 ? '' : 's'}`, 'bad', 1800);
        break;
      }
      case 'unlock': alert(`Tier ${ev.tier} sends are open`, 'good'); break;
      case 'rising': alert(`The Rising Tide — step ${ev.step}. Leaks hit harder.`, 'warn', 3800); break;
      case 'heroDown':
        if (ev.player === player) break;   // the big "Your hero has fallen" card says it (main.js)
        if (s.players[ev.player]?.team === myTeam) alert(`${s.players[ev.player].name} is down`, 'bad', 2000);
        else if (s.players[ev.player]?.team !== myTeam) alert('Rival hero is down', 'good', 2000);
        break;
      case 'levelUp': if (ev.player === player) alert(`Level ${ev.level} — a skill point is ready (Ctrl + Q/W/E/R)`, 'good', 2200); break;
      case 'talentReady': if (ev.player === player) alert('Level 6: choose a talent', 'good', 2600); break;
      case 'champion': {
        const f = sim.map.fields[ev.field];
        const name = data.units.units[ev.unit]?.name || 'A champion';
        if (f && f.team === myTeam) alert(`${name} marches on your Keep!`, 'warn', 3600);
        else alert(`Your ${name} leaves the gate`, 'good', 2600);
        break;
      }
      case 'counter': {
        if (ev.target !== player) break;
        const who = s.players[ev.player]?.name || 'Your rival';
        alert(`${who} sends ${ev.name}${ev.count > 1 ? ` ×${ev.count}` : ''} — ${ev.reason}`, 'warn', 3600);
        break;
      }
      case 'upgradeUnit': case 'unitUpgrade': if (ev.player === player) alert('Your army is better trained', 'good', 1600); break;
      default: break;
    }
  }

  return {
    update, onEvent, alert,
    get paused() { return paused; },
    togglePause() { setPaused(!paused); },
    /** Match over: clear the talent pick, alerts and the reject line so the result word stands alone. */
    hideTransient() { talent.hidden = true; talentShown = true; alerts.replaceChildren(); reject.classList.remove('show'); board.hidden = true; },
    onArmy(fn) { onArmyClick = fn; },
    reasonText(r) { return REJECT_TEXT[r] || r; },
    /** A send was bought: "+1.8 income" floats up from the income counter. */
    sendFeedback(income) {
      const inc = econ.querySelector('.income');
      const f = h('span', 'inc-float', `+${Math.round(income * 10) / 10}`);
      inc.append(f);
      setTimeout(() => f.remove(), 900);
      inc.classList.remove('bump'); void inc.offsetWidth; inc.classList.add('bump');
    },
    /** Menu input for this view's device while paused. */
    pauseFrame(frame) { if (paused) pauseNav.handle(frame); },
    get talentOpen() { return talentShown; },
    /** Pad: drive the talent cards (d-pad + A). Returns true while it owns the pad. */
    talentFrame(frame) { if (!talentShown) return false; talentNav.handle(frame); return true; },
    setPaused,
    showBoard(v) { board.hidden = !v; if (v) drawBoard(); },
    get boardOpen() { return !board.hidden; },
    destroy() { window.removeEventListener('keydown', onKey); pauseNav.destroy(); talentNav.destroy(); root.replaceChildren(); gate.remove(); },
  };
}
