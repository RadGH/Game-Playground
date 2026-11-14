// The skill book (owner 2026-11-13: "redesign the talent and skill menus … completely rebuilt"). Two pages in one window:
//   Skills (K)   every skill of your class and specialization: what it does at your rank, its price, when it next grows,
//                the talents that boost it, and the six-slot action bar (tap a slot, or drag a skill onto it).
//   Talents (N)  the talent trees (docs/TALENTS.md): your class tree and your specialization's three, as a grid of rows
//                opened by level (the level rail on the left), arrows from a talent to the one it opens, a detail panel
//                with this rank and the next, and Learn. At level 10 the specialization choice sits in its own tab.
// A hero saved before classes came at creation (no class) gets the class choice here before anything else.
// Looking is separate from committing (lessons rule 47): tapping anything shows it; only the panel's button acts.
//   const ui = createSkillsUI({ content, send, getChar });  ui.toggle(true, 'talents');  ui.check(ch)
import { rankOf, costOf } from '../sim/skills.js';
import { isTalent, isSkill, ownsTree, talentOpen, RANK_EVERY, PATH_ROWS, SPEC_ROWS } from '../sim/talents.js';
import { skillText, talentLines, boostsOn, boostersOf, RES_NAME } from '../rules/skill-text.js';
import { ask } from '../../../../shared/dialog.js';
import { secs } from '../../../../shared/format.js';
import { skillIcon as libSkillIcon, talentIcon as libTalentIcon } from './icons.js';
import { classTiles, classDetail, ROLE } from './class-pick.js';

export { skillText, RES_NAME };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KIND = { passive: 'Talent', synergy: 'Talent', talent: 'Talent' };

export function createSkillsUI({ content, send, getChar, isTouch = () => false }) {
  const S = content.skills, P = content.paths, SP = content.specs || {};
  const icon = (sk, size = 40) => libSkillIcon(sk, content, size);
  /** A talent that changes one skill wears that skill's picture; anything else gets its own medallion. */
  const talentIcon = (t, size) => libTalentIcon(t, content, size);
  const root = document.createElement('div'); root.className = 'skills-ui'; root.hidden = true; document.body.append(root);
  let page = 'skills', tree = null, selSkill = null, selTalent = null, pickClass = null, pickSpec = null, specAsked = false;
  const scrolls = {};                                     // each page keeps its list's scroll position across redraws (rule 12)

  function toggle(force, want) {
    root.hidden = force != null ? !force : !root.hidden;
    if (want) page = want;
    if (!root.hidden) draw();
  }
  const ch0 = () => getChar();

  // ---------------------------------------------------------------- the frame
  function draw(ch = ch0()) {
    if (root.hidden || !ch) return;
    const keep = root.querySelector('.bk-scroll'); if (keep) scrolls[keep.dataset.keep] = keep.scrollTop;
    if (!ch.path) return drawClassPick(ch);
    const pts = ch.skillPoints || 0;
    const tabs = `<nav class="bk-pages" role="tablist">
      <button role="tab" data-page="skills" class="${page === 'skills' ? 'on' : ''}" aria-selected="${page === 'skills'}">Skills${isTouch() ? '' : ' <kbd>K</kbd>'}</button>
      <button role="tab" data-page="talents" class="${page === 'talents' ? 'on' : ''}" aria-selected="${page === 'talents'}">Talents${pts ? ` <span class="pip">${pts}</span>` : ''}${isTouch() ? '' : ' <kbd>N</kbd>'}</button></nav>`;
    const who = `${esc(ch.name)} · Level ${ch.level} ${esc(SP[ch.spec]?.name || P[ch.path]?.name || '')}`;
    root.innerHTML = `<div class="bk-panel bk-${page}"><header class="bk-top"><div class="bk-who">${who}</div>${tabs}<button class="x" data-close aria-label="Close">×</button></header>
      ${page === 'skills' ? skillsPage(ch) : talentsPage(ch)}</div>`;
    root.querySelector('[data-close]').onclick = () => toggle(false);
    root.querySelectorAll('[data-page]').forEach(b => b.onclick = () => { page = b.dataset.page; draw(); });
    const sc = root.querySelector('.bk-scroll'); if (sc && scrolls[sc.dataset.keep] != null) sc.scrollTop = scrolls[sc.dataset.keep];
    if (page === 'skills') wireSkills(ch); else wireTalents(ch);
  }

  // ---------------------------------------------------------------- class choice (old saves without one)
  function drawClassPick(ch) {
    root.innerHTML = `<div class="bk-panel bk-class"><header class="bk-top"><div class="bk-who">${esc(ch.name)} · Level ${ch.level}</div><h2>Choose a class</h2><button class="x" data-close aria-label="Close">×</button></header>
      <div class="bk-scroll" data-keep="class"><p class="bk-lead">Heroes now pick their class when they are made. Pick ${esc(ch.name)}'s to keep playing; it is for good.</p>
      ${classTiles(content, pickClass)}${classDetail(content, pickClass)}
      <div class="btns"><button class="primary" data-become ${pickClass ? '' : 'disabled'}>${pickClass ? `Become a ${esc(P[pickClass].name)}` : 'Pick a class first'}</button></div></div></div>`;
    root.querySelector('[data-close]').onclick = () => toggle(false);
    root.querySelectorAll('[data-class]').forEach(b => b.onclick = () => { pickClass = b.dataset.class; draw(); });
    root.querySelector('[data-become]').onclick = () => pickClass && ask({ title: `Become a ${P[pickClass].name}?`, text: 'A class is for good.', ok: 'Choose' }).then(y => y && send({ do: 'path', path: pickClass }));
  }

  // ---------------------------------------------------------------- Skills page
  function mySkills(ch) {
    const groups = [];
    const of = owner => Object.values(S).filter(s => isSkill(s) && !s.hidden && !s.stanceOnly && s.owner === owner).sort((a, b) => (a.reqLevel || 1) - (b.reqLevel || 1) || a.name.localeCompare(b.name));
    groups.push([P[ch.path]?.name + ' skills', of(ch.path)]);
    if (ch.spec) groups.push([SP[ch.spec]?.name + ' skills', of(ch.spec)]);
    const common = Object.values(S).filter(s => isSkill(s) && !s.hidden && (s.owner === 'wanderer'));
    if (common.length) groups.push(['For everyone', common]);
    return groups.filter(g => g[1].length);
  }
  const lineOf = (ch, s, r) => {
    const c = costOf(S, content.resources, ch, s, Math.max(1, r));
    return [c.n ? `${c.n} ${RES_NAME[c.kind] || c.kind}` : 'Free', s.cast ? `${secs(s.cast)} cast` : s.channel ? `${secs(s.channel)} channel` : 'Instant', s.cd ? `${secs(s.cd)} cooldown` : ''].filter(Boolean);
  };
  function skillsPage(ch) {
    const groups = mySkills(ch), all = groups.flatMap(g => g[1]);
    if (!selSkill || !all.some(s => s.id === selSkill)) selSkill = (ch.bar || []).find(id => id && all.some(s => s.id === id)) || all[0]?.id;
    const bar = [0, 1, 2, 3, 4, 5].map(i => ch.bar?.[i] || null);
    const row = s => {
      const r = rankOf(ch, s), locked = r < 1, slot = bar.indexOf(s.id);
      return `<button class="bk-row${locked ? ' locked' : ''}${s.id === selSkill ? ' sel' : ''}" data-skill="${s.id}">
        <span class="ic">${icon(s, 40)}${slot >= 0 ? `<b class="onbar">${slot + 1}</b>` : ''}</span>
        <span class="tx"><b>${esc(s.name)}</b><small>${locked ? `Opens at level ${s.reqLevel || 1}` : `Rank ${r} of ${s.maxRank || 1} · ${esc(lineOf(ch, s, r).slice(0, 2).join(' · '))}`}</small></span></button>`;
    };
    return `<div class="bk-body bk-skills-body">
      <div class="bk-scroll bk-list" data-keep="skills">${groups.map(([name, list]) => `<h3>${esc(name)}</h3>${list.map(row).join('')}`).join('')}</div>
      <section class="bk-detail">${skillDetail(ch, S[selSkill], bar)}</section>
      <section class="bk-bar"><h3>Action bar</h3><div class="bk-slots">${bar.map((id, i) => `<button class="bk-slot${id ? '' : ' empty'}${id && id === selSkill ? ' sel' : ''}" data-slot="${i}" aria-label="Slot ${i + 1}${id ? ': ' + esc(S[id]?.name) : ', empty'}"><kbd>${i + 1}</kbd>${id ? icon(S[id], 34) : ''}<small>${id ? esc(S[id]?.name || '') : 'Empty'}</small></button>`).join('')}</div></section>
    </div>`;
  }
  function skillDetail(ch, s, bar) {
    if (!s) return '<p class="bk-empty">No skills yet.</p>';
    const r = rankOf(ch, s), max = s.maxRank || 1, locked = r < 1, L0 = s.reqLevel || 1;
    const next = !locked && r < max ? L0 + RANK_EVERY * r : null;
    const on = boostsOn(s.id, ch, content), could = boostersOf(s.id, content, ch).filter(t => !(ch.skills?.[t.id] > 0) && talentOpen(ch, t));
    const slot = bar.indexOf(s.id);
    return `<div class="bk-dhead"><span class="ic big">${icon(s, 56)}</span><div><h3>${esc(s.name)}</h3>
        <small>${locked ? `Opens at level ${L0}` : `Rank ${r} of ${max}${next ? ` · rank ${r + 1} at level ${next}` : ' · full strength'}`}</small></div></div>
      <div class="bk-chips">${lineOf(ch, s, r).map(x => `<span>${esc(x)}</span>`).join('')}${s.range ? `<span>${s.range} m reach</span>` : ''}</div>
      <p class="bk-desc">${esc(skillText(s, Math.max(1, r), ch.level, ch, S))}</p>
      ${next ? `<p class="bk-next"><b>At rank ${r + 1}:</b> ${esc(skillText(s, r + 1, next, ch, S))}</p>` : ''}
      ${on.length || could.length ? `<h4>Talents for it</h4><ul class="bk-boost">${on.map(b => `<li class="have"><b>${esc(b.talent.name)} ${b.rank}/${b.talent.maxRank || 1}</b> ${esc(b.text)}</li>`).join('')}${could.slice(0, 6).map(t => `<li><button class="link" data-goto="${t.id}">${esc(t.name)}</button> <small>${esc(talentLines(t, 1, content)[0] || '')} a rank</small></li>`).join('')}</ul>` : ''}
      ${locked ? '' : `<h4>Put it on the bar</h4><div class="bk-put">${[0, 1, 2, 3, 4, 5].map(i => `<button data-put="${i}" class="${bar[i] === s.id ? 'on' : ''}" aria-label="Slot ${i + 1}">${i + 1}</button>`).join('')}${slot >= 0 ? '<button data-take>Take off</button>' : ''}</div>`}`;
  }
  function wireSkills(ch) {
    root.querySelectorAll('[data-skill]').forEach(b => b.onclick = () => { if (dragged) return; selSkill = b.dataset.skill; draw(); if (narrow()) root.querySelector('.bk-detail')?.scrollIntoView({ block: 'nearest' }); });
    root.querySelectorAll('[data-put]').forEach(b => b.onclick = () => send({ do: 'bar', i: +b.dataset.put, skill: selSkill }));
    root.querySelector('[data-take]')?.addEventListener('click', () => { const i = (ch.bar || []).indexOf(selSkill); if (i >= 0) send({ do: 'bar', i, skill: null }); });
    root.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { const id = ch.bar?.[+b.dataset.slot]; if (dragged) return; if (id) { selSkill = id; draw(); } else if (selSkill && rankOf(ch, S[selSkill]) > 0) send({ do: 'bar', i: +b.dataset.slot, skill: selSkill }); });
    root.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { const t = S[b.dataset.goto]; page = 'talents'; tree = t.tree; selTalent = t.id; draw(); });
    root.querySelectorAll('.bk-row:not(.locked) .ic, .bk-slot:not(.empty)').forEach(el => el.addEventListener('pointerdown', e => startDrag(e, el)));
  }
  // drag a skill onto a slot (or a slot onto another slot to swap; off the bar to take it off)
  let drag = null, dragged = false;
  function startDrag(e, el) {
    if (e.button === 2) return;
    const host = el.closest('[data-skill], [data-slot]'), ch = ch0();
    const id = host.dataset.skill || ch?.bar?.[+host.dataset.slot]; if (!id) return;
    drag = { id, from: host.dataset.slot != null ? +host.dataset.slot : null, x0: e.clientX, y0: e.clientY, on: false, ghost: null };
    dragged = false;
    addEventListener('pointermove', moveDrag); addEventListener('pointerup', endDrag, { once: true });
  }
  function moveDrag(e) {
    if (!drag) return;
    if (!drag.on && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
    if (!drag.on) { drag.on = true; dragged = true; drag.ghost = document.createElement('div'); drag.ghost.className = 'drag-ghost'; drag.ghost.innerHTML = icon(S[drag.id], 40); document.body.append(drag.ghost); }
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    root.querySelectorAll('.drop-ok').forEach(x => x.classList.remove('drop-ok'));
    slotUnder(e)?.classList.add('drop-ok');
  }
  function slotUnder(e) { drag.ghost && (drag.ghost.style.display = 'none'); const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-slot]'); drag.ghost && (drag.ghost.style.display = ''); return el; }
  function endDrag(e) {
    removeEventListener('pointermove', moveDrag);
    if (drag?.on) {
      const t = slotUnder(e); drag.ghost?.remove();
      if (t) send({ do: 'bar', i: +t.dataset.slot, skill: drag.id });
      else if (drag.from != null && !e.target.closest?.('.bk-bar')) send({ do: 'bar', i: drag.from, skill: null });
      setTimeout(() => { dragged = false; }, 50);
    }
    drag = null;
  }

  // ---------------------------------------------------------------- Talents page
  function treesOf(ch) {
    const out = [{ id: P[ch.path].tree.id, name: P[ch.path].tree.name, owner: ch.path, rows: PATH_ROWS }];
    if (ch.spec) for (const t of SP[ch.spec]?.trees || []) out.push({ id: t.id, name: t.name, owner: ch.spec, rows: SPEC_ROWS, blurb: t.blurb });
    else out.push({ id: '@spec', name: 'Specialization', rows: [], spec: true });
    return out;
  }
  const talentsIn = (ch, tr) => Object.values(S).filter(t => isTalent(t) && t.owner === tr.owner && t.tree === tr.id);
  const spentIn = (ch, tr) => talentsIn(ch, tr).reduce((n, t) => n + (ch.skills?.[t.id] || 0), 0);
  /** Why a talent can't take a point now ('' when it can). */
  function refusal(ch, t) {
    const r = ch.skills?.[t.id] || 0;
    if (!talentOpen(ch, t)) return `${forWhom(t)} only`;
    if (r >= (t.maxRank || 1)) return 'Fully learned';
    if (ch.level < (t.reqLevel || 1)) return `Needs level ${t.reqLevel}`;
    const miss = (t.prereq || []).find(p => !(ch.skills?.[p] > 0)); if (miss) return `Needs a point in ${S[miss]?.name || 'the talent above'}`;
    if (!(ch.skillPoints > 0)) return 'No talent points left';
    return '';
  }
  const forWhom = t => [...(t.when?.spec || []).map(id => SP[id]?.name), ...(t.when?.path || []).map(id => P[id]?.name)].filter(Boolean).join(' or ');
  function talentsPage(ch) {
    const trees = treesOf(ch);
    if (!tree || !trees.some(t => t.id === tree)) tree = (ch.level >= 10 && !ch.spec) ? '@spec' : trees[0].id;
    const tr = trees.find(t => t.id === tree);
    const tabs = `<nav class="bk-trees">${trees.map(t => `<button data-tree="${t.id}" class="${t.id === tree ? 'on' : ''}${t.spec && ch.level >= 10 ? ' call' : ''}">${esc(t.name)}<small>${t.spec ? (ch.level >= 10 ? 'Choose now' : 'Level 10') : `${spentIn(ch, t)} point${spentIn(ch, t) === 1 ? '' : 's'}`}</small></button>`).join('')}</nav>`;
    const pts = `<div class="bk-pts${ch.skillPoints ? ' have' : ''}"><b>${ch.skillPoints || 0}</b> talent point${ch.skillPoints === 1 ? '' : 's'} to spend</div>`;
    if (tr.spec) return `<div class="bk-body bk-talents-body">${tabs}${pts}${specPage(ch)}</div>`;
    const list = talentsIn(ch, tr);
    if (!selTalent || !list.some(t => t.id === selTalent)) selTalent = (list.find(t => !refusal(ch, t)) || list[0])?.id || null;
    const grid = tr.rows.map((L, ri) => {
      const open = ch.level >= L, cells = [0, 1, 2, 3].map(c => {
        const t = list.find(x => (x.reqLevel || 1) === L && (x.col || 0) === c);
        if (!t) return '<i class="bk-cell"></i>';
        const r = ch.skills?.[t.id] || 0, max = t.maxRank || 1, why = refusal(ch, t), mine = talentOpen(ch, t);
        const st = !mine ? 'other' : r >= max ? 'full' : r > 0 ? 'some' : !why ? 'can' : 'locked';
        return `<button class="bk-tal st-${st}${t.id === selTalent ? ' sel' : ''}" data-tal="${t.id}" data-row="${ri}" data-col="${c}" aria-label="${esc(t.name)}, ${r} of ${max}">${talentIcon(t, 44)}<b class="rk">${r}/${max}</b></button>`;
      }).join('');
      return `<div class="bk-trow${open ? ' open' : ''}"><span class="bk-lv" aria-label="Level ${L}">${L}</span>${cells}</div>`;
    }).join('');
    return `<div class="bk-body bk-talents-body">${tabs}${pts}
      <div class="bk-scroll bk-treewrap" data-keep="talents-${tree}"><div class="bk-tree" data-tree-grid>${grid}<svg class="bk-arrows" aria-hidden="true"></svg></div></div>
      <section class="bk-detail">${talentDetail(ch, S[selTalent])}${tr.owner === ch.spec && tr.blurb ? `<p class="bk-tblurb"><b>${esc(tr.name)}:</b> ${esc(tr.blurb)}</p>` : ''}</section></div>`;
  }
  function talentDetail(ch, t) {
    if (!t) return '<p class="bk-empty">This tree has no talents yet.</p>';
    const r = ch.skills?.[t.id] || 0, max = t.maxRank || 1, why = refusal(ch, t);
    const reqs = [
      [`Level ${t.reqLevel || 1}`, ch.level >= (t.reqLevel || 1)],
      ...(t.prereq || []).map(p => [`A point in ${S[p]?.name || 'the talent above'}`, ch.skills?.[p] > 0]),
      ...(t.when ? [[`${forWhom(t)} only`, talentOpen(ch, t)]] : []),
    ];
    const opens = Object.values(S).filter(x => (x.prereq || []).includes(t.id));
    return `<div class="bk-dhead"><span class="ic big">${talentIcon(t, 56)}</span><div><h3>${esc(t.name)}</h3><small>${KIND[t.kind] || 'Talent'} · rank ${r} of ${max}</small></div></div>
      ${r > 0 ? `<h4>Now</h4><ul class="bk-eff">${talentLines(t, r, content).map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      ${r < max ? `<h4>${r ? `Rank ${r + 1}` : 'Rank 1'}</h4><ul class="bk-eff next">${talentLines(t, r + 1, content).map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      ${max > 1 && r < max - 1 ? `<p class="bk-max">At rank ${max}: ${esc(talentLines(t, max, content).join(', '))}</p>` : ''}
      ${t.flavour ? `<p class="bk-flav">${esc(t.flavour)}</p>` : ''}
      <ul class="bk-req">${reqs.map(([txt, ok]) => `<li class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ${esc(txt)}</li>`).join('')}${opens.length ? `<li class="opens">Opens ${opens.map(o => esc(o.name)).join(', ')}</li>` : ''}</ul>
      <button class="primary bk-learn" data-learn="${t.id}" ${why ? 'disabled' : ''}>${why ? esc(why) : `Learn rank ${r + 1} · 1 point`}</button>`;
  }
  function specPage(ch) {
    const list = Object.entries(SP).filter(([, sp]) => (sp.paths || []).includes(ch.path));
    if (!pickSpec || !list.some(([id]) => id === pickSpec)) pickSpec = list[0]?.[0];
    const sp = SP[pickSpec], can = ch.level >= 10;
    const starters = Object.values(S).filter(s => isSkill(s) && s.owner === pickSpec && !s.hidden).sort((a, b) => (a.reqLevel || 0) - (b.reqLevel || 0)).slice(0, 4);
    return `<div class="bk-scroll bk-specs" data-keep="specs"><div class="bk-speclist">${list.map(([id, s]) => `<button class="bk-spec${id === pickSpec ? ' on' : ''}" data-spec="${id}"><b>${esc(s.name)}</b><small>${(s.paths || []).length > 1 ? 'Hybrid · ' : ''}${esc(s.role || '')}</small></button>`).join('')}</div></div>
      <section class="bk-detail bk-specdetail">${sp ? `<h3>${esc(sp.name)}</h3><small>${esc(sp.role || '')}${(sp.armour || []).length ? ` · wears ${esc(sp.armour.join(', '))}` : ''}</small><p>${esc(sp.blurb || '')}</p>
        <h4>Three talent trees</h4><ul class="bk-sptrees">${(sp.trees || []).map(t => `<li><b>${esc(t.name)}</b> ${esc(t.blurb || '')}</li>`).join('')}</ul>
        ${starters.length ? `<h4>New skills</h4><ul class="bk-spskills">${starters.map(s => `<li>${icon(s, 26)}<span><b>${esc(s.name)}</b> <small>level ${s.reqLevel || 10}</small></span></li>`).join('')}</ul>` : ''}
        <button class="primary" data-pickspec ${can ? '' : 'disabled'}>${can ? `Become a ${esc(sp.name)}` : `Opens at level 10 (you are ${ch.level})`}</button>` : ''}</section>`;
  }
  function wireTalents(ch) {
    root.querySelectorAll('[data-tree]').forEach(b => b.onclick = () => { tree = b.dataset.tree; selTalent = null; draw(); });
    root.querySelectorAll('[data-tal]').forEach(b => {
      b.onclick = () => { selTalent = b.dataset.tal; draw(); if (narrow()) root.querySelector('.bk-detail')?.scrollIntoView({ block: 'nearest' }); };
      b.ondblclick = () => { if (!refusal(ch, S[b.dataset.tal])) send({ do: 'learn', skill: b.dataset.tal }); };
    });
    root.querySelector('[data-learn]')?.addEventListener('click', e => send({ do: 'learn', skill: e.currentTarget.dataset.learn }));
    root.querySelectorAll('[data-spec]').forEach(b => b.onclick = () => { pickSpec = b.dataset.spec; draw(); });
    root.querySelector('[data-pickspec]')?.addEventListener('click', () => ask({ title: `Become a ${SP[pickSpec].name}?`, text: 'The trainer in Brightwater can change it later, for gold.', ok: 'Choose' }).then(y => y && send({ do: 'spec', spec: pickSpec })));
    requestAnimationFrame(drawArrows);
  }
  /** Arrows from each talent to the ones it opens; gold once the first has a point. Drawn from the laid-out grid. */
  function drawArrows() {
    const grid = root.querySelector('[data-tree-grid]'), svg = grid?.querySelector('.bk-arrows'); if (!svg) return;
    const ch = ch0(), g = grid.getBoundingClientRect(); svg.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`);
    let out = '';
    for (const el of grid.querySelectorAll('[data-tal]')) {
      const t = S[el.dataset.tal];
      for (const p of t.prereq || []) {
        const from = grid.querySelector(`[data-tal="${p}"]`); if (!from) continue;
        const a = from.getBoundingClientRect(), b = el.getBoundingClientRect(), lit = ch.skills?.[p] > 0;
        const x1 = a.left + a.width / 2 - g.left, y1 = a.bottom - g.top, x2 = b.left + b.width / 2 - g.left, y2 = b.top - g.top - 2;
        const path = Math.abs(x1 - x2) < 2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}V${(y1 + y2) / 2}H${x2}V${y2}`;
        out += `<path d="${path}" class="${lit ? 'lit' : ''}"/><path d="M${x2 - 6} ${y2 - 7}L${x2} ${y2}L${x2 + 6} ${y2 - 7}z" class="head${lit ? ' lit' : ''}"/>`;
      }
    }
    svg.innerHTML = out;
  }
  addEventListener('resize', () => { if (!root.hidden && page === 'talents') drawArrows(); });
  const narrow = () => innerWidth < 720;

  /** Called on every character update: no class → the class choice; level 10 with no specialization → once, the
   *  Specialization tab. Redraws while open. */
  function check(ch) {
    if (ch && !ch.path && root.hidden) { toggle(true); return; }
    if (ch && ch.path && !ch.spec && ch.level >= 10 && !specAsked && Object.keys(SP).length) { specAsked = true; page = 'talents'; tree = '@spec'; toggle(true); return; }
    if (!root.hidden) draw(ch);
  }
  root.addEventListener('click', e => { if (e.target === root) toggle(false); });
  return { toggle, draw, check, get open() { return !root.hidden; }, get page() { return page; } };
}
