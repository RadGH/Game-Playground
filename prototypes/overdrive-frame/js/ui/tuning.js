// The Tuning rig (round 7 — owner: "more skills and talent type of systems … where is that?"): a hangar bay with two
// jobs. Frame Tuning — four boards of calibration nodes (sim/tuning.js) for the active saved build; points come from
// pilot rank and story missions, re-tuning is free. Skill — pick the build's active skill (sim/skills.js; new ones
// open with rank). Both are per build, so a sniper build and a brawler build can be tuned differently.
import { fmt } from '../../../../shared/format.js';
import { rankOf } from '../sim/progress.js';
import { BOARDS, NODES, tuningPoints, pointsSpent, boardSpent, canRaise, canLower, nodeText, rowNeed } from '../sim/tuning.js';
import { SKILLS, SKILL_BY_ID } from '../sim/skills.js';
import { activeBuild } from '../sim/inventory.js';
import { activeSets, linesWorn, SETS, SET_NEED } from '../sim/frames.js';
import { baySheet, click } from './bays.js';
import { esc } from './itemcard.js';
import { play as sound } from '../../../../citykit/js/world/sound.js';

/** Story missions flown (each is a tuning point). Contracts never write a grade, so grades = story missions. */
export const storiesFlown = save => Object.keys(save.grades || {}).length;

export function openTuning(screens, { onClose, onChange } = {}) {
  const g = screens.g, save = g.save;
  let tab = 'tune';
  const sheet = baySheet(screens, 'tuning', { title: 'Tuning rig', tabs: [['tune', 'Frame Tuning'], ['skill', 'Skill'], ['sets', 'Frame lines']], tab, onTab: t => { tab = t; draw(); }, onClose });
  const B = () => activeBuild(save);
  const changed = () => { g.saveNow(); onChange?.(); };

  const drawTune = () => {
    const b = B(); b.tuning ||= {};
    const rk = rankOf(save.xp).rank, pts = tuningPoints(rk, storiesFlown(save)), used = pointsSpent(b.tuning);
    const scroll = sheet.body.scrollTop;
    sheet.body.innerHTML = `<div class="of-tune-head"><p><b class="of-tune-pts">${pts - used}</b> of ${pts} points free <small>2 a rank · 1 a story mission flown</small></p>
        <p class="of-note">Tuning <b>${esc(b.name)}</b>. Each saved build keeps its own tuning; taking points out is free.</p>
        <button type="button" class="of-btn of-small" data-reset${used ? '' : ' disabled'}>Take every point out</button></div>
      <div class="of-boards">${BOARDS.map(bd => `<section class="of-tboard" style="--bc:${bd.colour}" aria-label="${bd.name}"><header><b>${bd.name}</b><small>${bd.blurb} · ${boardSpent(b.tuning, bd.id)} in</small></header>
        ${[1, 2, 3, 4, 5].map(row => `<div class="of-trow${NODES.some(n => n.board === bd.id && n.row === row && n.pick) ? ' of-trow-key' : ''}">
          ${row > 1 ? `<small class="of-trow-need">Row ${row} · ${rowNeed(row)} points above${NODES.some(n => n.board === bd.id && n.row === row && n.pick) ? ' · pick one' : ''}</small>` : ''}
          ${NODES.filter(n => n.board === bd.id && n.row === row).map(n => node(n, b.tuning, pts)).join('')}</div>`).join('')}
      </section>`).join('')}</div>`;
    sheet.body.scrollTop = scroll;
    sheet.body.querySelectorAll('[data-up]').forEach(x => x.addEventListener('click', () => {
      const why = canRaise(B().tuning, x.dataset.up, pts); if (why) { sound('ui.error', { global: true, gain: 0.4 }); return; }
      B().tuning[x.dataset.up] = (B().tuning[x.dataset.up] || 0) + 1; sound('lever.pull', { global: true, gain: 0.5 }); changed(); drawTune();
    }));
    sheet.body.querySelectorAll('[data-down]').forEach(x => x.addEventListener('click', e => {
      e.stopPropagation();
      const id = x.dataset.down; if (canLower(B().tuning, id)) { sound('ui.error', { global: true, gain: 0.4 }); return; }
      B().tuning[id]--; if (!B().tuning[id]) delete B().tuning[id]; click(); changed(); drawTune();
    }));
    sheet.body.querySelector('[data-reset]')?.addEventListener('click', () => { B().tuning = {}; click(); changed(); drawTune(); });
  };
  const node = (n, t, pts) => {
    const r = t[n.id] || 0, why = canRaise(t, n.id, pts), low = r > 0 ? canLower(t, n.id) : 'none';
    const state = r >= n.max ? 'full' : r > 0 ? 'some' : why ? 'locked' : 'open';
    return `<div class="of-node of-node-${state}${n.key ? ' of-node-key' : ''}">
      <button type="button" class="of-node-main" data-up="${n.id}" aria-label="${esc(n.name)}: ${r} of ${n.max}${why && r < n.max ? ' — ' + esc(why) : ''}"${why && r < n.max ? ' aria-disabled="true"' : ''}>
        <span class="of-node-top"><b>${esc(n.name)}</b><span class="of-node-pips">${'●'.repeat(r)}${'○'.repeat(n.max - r)}</span></span>
        <span class="of-node-text">${esc(nodeText(n, r || 1))}${n.max > 1 && r < n.max && r > 0 ? ` <em>next: ${esc(nodeText(n, r + 1))}</em>` : ''}</span>
        ${why && r < n.max && state === 'locked' ? `<small class="of-node-why">${esc(why)}</small>` : ''}
      </button>
      ${r > 0 ? `<button type="button" class="of-btn of-small of-node-down" data-down="${n.id}" aria-label="Take a point out of ${esc(n.name)}"${low ? ' disabled' : ''}>−</button>` : ''}
    </div>`;
  };

  const drawSkill = () => {
    const b = B(), rk = rankOf(save.xp).rank, cur = SKILL_BY_ID[b.skill] ? b.skill : 'repulse';
    sheet.body.innerHTML = `<p class="of-note">One skill per build — key 2, controller d-pad right, touch Skill. It recharges after use; Systems tuning makes it recharge faster, hold two charges or hit harder. Damage grows with the mission's danger.</p>
      <div class="of-grid of-skills">${SKILLS.map(sk => { const lk = sk.rank > rk, on = sk.id === cur; return `<button type="button" class="of-item of-skill${on ? ' on' : ''}" data-sk="${sk.id}" style="--rc:${sk.colour}" aria-pressed="${on}"${lk ? ' disabled' : ''}>
        <header><b>${esc(sk.name)}</b><small>${lk ? `Opens at rank ${sk.rank}` : on ? 'Fitted' : `${fmt(sk.cd, { decimals: 0 })} s recharge`}</small></header><p>${esc(sk.text)}</p>${on ? `<small class="of-used">${fmt(sk.cd, { decimals: 0 })} s recharge</small>` : ''}</button>`; }).join('')}</div>`;
    sheet.body.querySelectorAll('[data-sk]').forEach(x => x.addEventListener('click', () => { B().skill = x.dataset.sk; sound('lever.pull', { global: true, gain: 0.5 }); changed(); drawSkill(); }));
  };

  const drawSets = () => {
    const b = g.build(), worn = linesWorn(b, g.P), on = new Set(activeSets(b, g.P).map(s => s.line));
    const byMaker = g.MAKERS.map(mk => ({ mk, lines: Object.entries(SETS).filter(([, s]) => s.maker === mk.id) })).filter(x => x.lines.length);
    sheet.body.innerHTML = `<p class="of-note">Every head, core, arms, legs and booster belongs to one of a maker's frames. Wear ${SET_NEED} parts of the same frame and it switches on that frame's bonus. Your build wears: ${Object.entries(worn).map(([l, n]) => `<b>${esc(SETS[l]?.name || l)}</b> ${n}`).join(' · ') || 'nothing yet'}.</p>
      ${byMaker.map(({ mk, lines }) => `<h4 class="of-shelf" style="color:${mk.colours.glow}">${esc(mk.name)}</h4><div class="of-grid">${lines.map(([id, s]) => `<article class="of-item of-set${on.has(id) ? ' on' : ''}" style="--rc:${mk.colours.glow}">
        <header><b>${esc(s.name)}</b><small>${on.has(id) ? 'Bonus on' : `${worn[id] || 0} of ${SET_NEED} worn`}</small></header><p>${esc(s.look || '')}</p><p class="of-set-bonus"><b>Set bonus</b> ${esc(s.text)}</p></article>`).join('')}</div>`).join('')}`;
  };

  const draw = () => (tab === 'tune' ? drawTune() : tab === 'skill' ? drawSkill() : drawSets());
  draw();
  return sheet;
}
