// The Skills window (K) and the Perk Forest window (N) — play-test P6.
//
// Skills: the class's six skills in unlock order (what you have, what unlocks NEXT and at which level, the rest
// greyed with "unlocks at N"); pick one to open its talent tree — four tiers opening at levels 3/8/18/28, two or three
// nodes each that change HOW the skill works (a fan of bolts, a pull, a lingering pool…), one pick per tier.
// Perks: the forest graph (perk-forest.js) — drag, zoom, take a glowing node next to one you hold.
//
// Rules + data: talent-model.js (C's data when it lands, Farhold's until then). Picks go to the server through
// `net.talent` / `net.perk` when stream A's client has them (docs/requests.md "D (Client) -> A/C, play-test P6");
// until then the windows run in PREVIEW: picks are kept in this browser only and a banner says so.
//
// T28 (play-test 5): picks are STAGED. A click marks a perk or a talent as pending (blue, dashed, "3 left, 2 staged"); Undo / Redo
// (Ctrl+Z / Ctrl+Shift+Z) step through the staged picks; Accept sends them to the server in order; Cancel — or closing the
// window with picks still staged — asks first. Nothing is spent until Accept.
//
//   const T = createTalentsUi({ net: () => S.net, hud, me: () => ({ level, cls, char }) });
//   T.wire(net); T.skills.toggle(); T.perks.toggle(); T.refresh();

import { createPanel, h, confirmBox } from '../ui-panel.js';
import { skillIconSvg } from './skill-icons.js';
import { loadSkillData } from '../skillbar.js';
import { searchForest, createStage, stagedForest, stageCheck, stagedDependents, pointsText } from './talent-model.js';
import { makeSource, skillLadder, nextUnlockText, treeState, pickCheck, talentPicksWaiting, picksWaitingOn, forestState, perkCheck, refundCheck, perkTotals, talentsFromServer, perksFromServer, forestFromJson } from './talent-model.js';
import { createPerkGraph } from './perk-forest.js';
import { esc } from './tips.js';

const DATA = new URL('../../../data/', import.meta.url);
const KIND_NAME = { hub: 'The middle', minor: 'Minor perk', major: 'Major perk', talent: 'Talent perk', keystone: 'Keystone' };
const STAT_NAME = {
  damagePct: '% damage', damageFlat: ' damage per hit', maxHp: ' health', maxMp: ' mana', armor: ' armour', armorPct: '% armour', critChance: '% critical chance',
  critDamage: '% critical damage', haste: '% attack speed', dodge: '% dodge', spellPower: ' spell damage', magicResist: ' magic resistance', movePct: '% move speed',
  cooldownReduction: '% faster cooldowns', hpRegen: ' health a second', mpRegen: ' mana a second', blockChance: '% block', lifeSteal: '% life steal', areaPct: '% area',
  petDamagePct: '% companion damage', magicFind: '% magic find', goldFind: '% gold find', xpFind: '% experience', str: ' Strength', dex: ' Dexterity', int: ' Intellect', con: ' Constitution', heavyPct: '% heavy weapon damage', lightPct: '% light weapon damage', magicPct: '% magic weapon damage', /* round 11 (C, Z2) */
};

/**
 * The rules' data. C's Thousandvale files (data/rules/talents.json = the tree policy for js/rules/talents.js,
 * data/rules/perks.json = the forest data for js/rules/perk-forest.js — both pure modules, imported only when the
 * files hold content) win; until then Farhold's skills.json trees and perks.js forest.
 */
export async function loadTalentSource() {
  const opt = async f => { try { const r = await fetch(new URL(f, DATA)); return r.ok ? await r.json() : null; } catch { return null; } };
  const [shared, talentsJson, perksJson] = await Promise.all([loadSkillData(), opt('rules/talents.json'), opt('rules/perks.json')]);
  let skillsData = shared, forest = null, label = null;
  const policy = talentsJson && Object.keys(talentsJson).some(k => !k.startsWith('_') && k !== 'tierLevels' && k !== 'skills');
  if (policy && shared) {
    try {
      const { installTalentTrees } = await import('../../rules/talents.js');
      skillsData = JSON.parse(JSON.stringify(shared));         // skillbar.js shares the fetched object: never rewrite it
      installTalentTrees(skillsData, talentsJson);
      label = 'thousandvale';
    } catch (e) { console.warn('[talents] Thousandvale trees not applied:', e.message); skillsData = shared; }
  }
  if (perksJson && Array.isArray(perksJson.arms) && perksJson.arms.length && !perksJson.nodes) {
    try { const { buildTvForest } = await import('../../rules/perk-forest.js'); forest = buildTvForest(perksJson); label = 'thousandvale'; }
    catch (e) { console.warn('[talents] Thousandvale forest not built:', e.message); }
  }
  return makeSource({ skillsData, talentsJson: policy ? null : talentsJson, perksJson: forest ? null : perksJson, forest, label });
}

export function createTalentsUi({ net: getNet, hud, me }) {
  const net = () => getNet?.();
  const S = { src: null, talents: {}, trees: {}, perks: [], bonus: 0, serverLeft: null, sel: null, server: { talents: false, perks: false }, history: [] };
  const PS = createStage();                                   // staged perk ids, in the order they were clicked
  const TS = createStage(x => `${x.skill}:${x.tier}`);        // staged talent picks { skill, tier, node, name } — one per tier
  const lvl = () => me()?.level || 1;
  const bar = () => net()?.joined?.you?.bar || null;
  const prevKey = () => 'tv.preview.p6.' + (me()?.char ?? 'anon');
  function loadPreview() { try { const v = JSON.parse(localStorage.getItem(prevKey()) || 'null'); if (v) { if (!S.server.talents) S.talents = v.talents || {}; if (!S.server.perks) S.perks = v.perks || []; } } catch { /* private window */ } }
  function savePreview() { try { localStorage.setItem(prevKey(), JSON.stringify({ talents: S.server.talents ? {} : S.talents, perks: S.server.perks ? [] : S.perks })); } catch { /* private window */ } }
  const ready = loadTalentSource().then(src => {
    const local = src.tree.bind(src);
    src.tree = id => S.trees[id] || local(id);           // the server's own trees (talentView) win when it sends them
    if (S.forestView) src.forest = S.forestView;
    S.src = src; loadPreview(); refresh(); return src;
  });

  // ================================================================ Skills window
  const skills = createPanel({ id: 'skills', title: 'Skills & Talents', width: 780, cls: 'tvt-skills', onOpen: p => { place(p); drawSkills(); } });
  const perks = createPanel({ id: 'perks', title: 'Perk Forest', width: 1120, cls: 'tvt-perks', onOpen: p => { place(p); drawPerks(); graph?.fit(); } });

  /** Open centred the first time (windows the player has dragged keep their spot). */
  function place(p) {
    if (p.root.classList.contains('placed')) return;
    const r = p.root.getBoundingClientRect();
    p.root.style.right = 'auto';
    p.root.style.left = Math.max(8, (window.innerWidth - r.width) / 2) + 'px';
    p.root.style.top = Math.max(8, Math.min(70, (window.innerHeight - r.height) / 2)) + 'px';
  }
  const banner = which => (S.server[which] ? null
    : h('p.tvt-preview', { role: 'note' }, h('b', {}, 'Preview — picks not saved yet. '), 'The server cannot store these choices yet; they are kept in this browser so you can plan a build.'));

  function drawSkills() {
    if (!skills.isOpen || !S.src) { if (skills.isOpen) skills.fill(h('p.empty', {}, 'Reading the skill books…')); return; }
    const level = lvl(), cls = me()?.cls || 'warrior';
    const ladder = skillLadder(S.src, cls, level, bar());
    if (!S.sel || !ladder.some(s => s.id === S.sel)) S.sel = (ladder.filter(s => s.unlocked).pop() || ladder[0])?.id || null;
    const waiting = talentPicksWaiting(S.src, ladder, S.talents, level);
    skills.setTitle('Skills & Talents', `Level ${level}${waiting ? ` · ${waiting} talent pick${waiting > 1 ? 's' : ''} waiting` : ''}`);
    const next = nextUnlockText(ladder, level);
    const list = h('ol.tvt-ladder', { 'aria-label': 'Your skills, in the order they unlock' }, ...ladder.map(s => {
      const w = picksWaitingOn(S.src, s, S.talents, level);      // Y38: the server's tree decides, not Farhold's row
      return h('li', {},
        h('button.tvt-skill' + (s.unlocked ? '' : '.locked') + (s.next ? '.next' : '') + (S.sel === s.id ? '.on' : ''), {
          type: 'button', dataset: { skill: s.id, tipHtml: skillTipHtml(s) }, onclick: () => { S.sel = s.id; drawSkills(); },
        },
        h('span.tvt-lv', {}, String(s.level)),
        icoSpan(s.id),
        h('span.tvt-sname', {}, s.name, h('small', {}, s.unlocked ? `Key ${s.slot}` : s.next ? `Next — unlocks at level ${s.level}` : `Unlocks at level ${s.level}`)),
        w ? h('b.tvt-dot', { dataset: { tip: `${w} talent pick${w > 1 ? 's' : ''} waiting` } }, String(w)) : null));
    }));
    const s = ladder.find(x => x.id === S.sel);
    skills.fill(
      banner('talents'),
      TS.n || TS.canRedo ? stageBar('talents') : null,
      next ? h('p.tvt-next', {}, next) : h('p.tvt-next.done', {}, 'Every skill of your calling is unlocked.'),
      h('div.tvt-cols', {}, list, s ? detail(s, level) : h('p.empty', {}, 'No skills yet.')),
    );
  }
  /** The same shared picture as the action bar and Icon Library. */
  function icoSpan(id) { const svg = skillIconSvg(id, 26); if (!svg) return null; const e = h('span.tvt-ico'); e.innerHTML = svg; return e; }
  function skillTipHtml(s) {
    const facts = [s.mp ? `${s.mp} mana` : '', s.cd ? `${(s.cd / 1000).toFixed(s.cd % 1000 ? 1 : 0)} s cooldown` : '', s.element && s.element !== 'physical' ? s.element : ''].filter(Boolean).join(' · ');
    return `<div class="tip-title">${skillIconSvg(s.id, 26) || ''}${esc(s.name)}</div><div class="${s.unlocked ? 'good' : 'bad'}">${s.unlocked ? 'Unlocked' : `Unlocks at level ${s.level}`}</div>${facts ? `<div class="tip-sub">${esc(facts)}</div>` : ''}${s.targets ? `<div class="tip-who">Affects: ${esc(s.targets)}</div>` : ''}${s.desc ? `<hr><div>${esc(s.desc)}</div>` : ''}`;
  }
  function detail(s, level) {
    const tree = S.src.tree(s.id);
    const mine = TS.list.filter(x => x.skill === s.id);
    const st = treeState(tree, { ...(S.talents[s.id] || {}), ...Object.fromEntries(mine.map(x => [x.tier, x.node])) }, level, { skillUnlocked: s.unlocked });
    // a staged tier is not spent: its pick reads "staged" and the other nodes of the tier can still be clicked instead
    for (const t of st.tiers) { const sg = mine.find(x => x.tier === t.tier); if (!sg) continue; t.staged = true; for (const n of t.nodes) n.state = n.id === sg.node ? 'staged' : 'open'; }
    const facts = [s.mp ? `${s.mp} mana` : null, s.cd ? `${(s.cd / 1000).toFixed(s.cd % 1000 ? 1 : 0)} s cooldown` : null, s.element && s.element !== 'physical' ? s.element : null].filter(Boolean);
    return h('section.tvt-detail', { 'aria-label': s.name },
      h('header.tvt-dhead', {}, h('h4', {}, icoSpan(s.id), s.name), h('span.tvt-state' + (s.unlocked ? '.ok' : ''), {}, s.unlocked ? `Key ${s.slot}` : `Unlocks at level ${s.level}`)),
      facts.length ? h('p.tvt-facts', {}, facts.join(' · ')) : null,
      s.targets ? h('p.tvt-facts.tvt-who', {}, `Affects: ${s.targets}`) : null,
      h('p.tvt-desc', {}, s.desc || ''),
      h('h5.tvt-th', {}, 'Talents', h('small', {}, ' — one pick per tier; each one changes how the skill works')),
      ...st.tiers.map(t => h('div.tvt-tier' + (t.open ? '' : '.closed') + (t.picked ? '.spent' : ''), {},
        h('div.tvt-tierhead', {}, h('b', {}, `Tier ${t.tier}`), h('span', {}, t.staged ? 'Staged — press Accept to keep it' : t.open ? (t.picked ? 'Chosen' : 'Choose one') : (s.unlocked ? `Opens at level ${t.level}` : `Level ${t.level}, once the skill is unlocked`))),
        h('div.tvt-nodes', {}, ...t.nodes.map(n => h('button.tvt-node.' + n.state, {
          type: 'button', disabled: n.state !== 'open' && n.state !== 'picked' && n.state !== 'staged',
          'aria-pressed': String(n.state === 'picked' || n.state === 'staged'),
          dataset: { node: n.id, tier: t.tier, tipHtml: nodeTipHtml(n, t, s) },
          onclick: () => pickTalent(s, t.tier, n.id),
        }, h('b', {}, n.name), h('span', {}, n.desc || ''), n.state === 'picked' ? h('i.tvt-tick', {}, 'Chosen') : n.state === 'staged' ? h('i.tvt-tick.staged', {}, 'Staged') : null))))));
  }
  function nodeTipHtml(n, t, s) {
    const state = n.state === 'picked' ? '<div class="good">Chosen</div>' : n.state === 'staged' ? '<div class="good">Staged — not spent yet. Click it again to take it back; Accept keeps it.</div>'
      : n.state === 'open' ? '<div class="good">Click to stage it — one per tier. Nothing is spent until you press Accept.</div>'
      : n.state === 'other' ? '<div class="bad">This tier is already chosen. An Unbinder in town can take it back.</div>'
        : `<div class="bad">${s.unlocked ? `Opens at level ${t.level}` : `Unlock ${esc(s.name)} first`}</div>`;
    return `<div class="tip-title">${esc(n.name)}</div><div class="tip-sub">${esc(s.name)} · tier ${t.tier}${n.bespoke ? '' : ' · shared talent'}</div><hr><div>${esc(n.desc || '')}</div>${state}`;
  }
  function pickTalent(s, tier, nodeId) {
    const tree = S.src.tree(s.id), picks = S.talents[s.id] || {};
    const key = `${s.id}:${tier}`;
    if (TS.list.some(x => x.skill === s.id && x.tier === tier && x.node === nodeId)) { TS.drop(key); refresh(); return; }   // a second click takes it back
    const others = Object.fromEntries(TS.list.filter(x => x.skill === s.id && x.tier !== tier).map(x => [x.tier, x.node]));
    const c = pickCheck(tree, { ...picks, ...others }, lvl(), tier, nodeId, { skillUnlocked: s.unlocked });
    if (!c.ok) { hud?.toast(c.why, 'warn'); return; }
    TS.add({ skill: s.id, tier, node: nodeId, name: tree.tiers.find(x => x.tier === tier)?.nodes.find(x => x.id === nodeId)?.name || 'Talent', skillName: s.name });
    refresh();
  }
  /** Accept: every staged talent goes to the server (or into the preview), in the order it was picked. */
  function acceptTalents() {
    const list = TS.take(); if (!list.length) return;
    const n = net();
    if (S.server.talents && typeof n?.talent === 'function') for (const x of list) n.talent('pick', { skill: x.skill, tier: x.tier, node: x.node });
    else { for (const x of list) S.talents = { ...S.talents, [x.skill]: { ...(S.talents[x.skill] || {}), [x.tier]: x.node } }; savePreview(); hud?.toast(`${list.length} talent${list.length > 1 ? 's' : ''} chosen (preview).`, 'good'); }
    refresh();
  }

  // ================================================================ T28: the staged-picks bar (both windows)
  function stageBar(which) {
    const st = which === 'perks' ? PS : TS, n = st.n, word = which === 'perks' ? 'perk' : 'talent';
    const act = (k, label, on, cls = 'ghost', off = false) => h(`button.${cls}.small`, { type: 'button', disabled: off, dataset: { stage: k }, onclick: on }, label);
    return h('div.stage-bar' + (n ? '.has' : ''), { role: 'group', 'aria-label': `Staged ${word} picks`, dataset: { which } },
      h('span.stage-text', {}, n ? h('b', {}, `${n} ${word}${n > 1 ? 's' : ''} staged`) : h('b', {}, 'Nothing staged'), n ? ' — nothing is spent until you press Accept.' : ' — Redo brings your last pick back.',
        which === 'talents' && n ? h('small', {}, ' ' + st.list.map(x => `${x.skillName}: ${x.name}`).join(' · ')) : null),
      h('span.grow'),
      act('undo', 'Undo', () => { st.undo(); prune(); refresh(); }, 'ghost', !st.canUndo), act('redo', 'Redo', () => { st.redo(); prune(); refresh(); }, 'ghost', !st.canRedo),
      act('cancel', 'Cancel', () => cancelStage(which), 'ghost', !n), act('accept', n ? `Accept ${n}` : 'Accept', () => (which === 'perks' ? acceptPerks() : acceptTalents()), 'primary', !n));
  }
  async function cancelStage(which) {
    const st = which === 'perks' ? PS : TS; if (!st.n) return true;
    if (!(await confirmBox(`Throw away your ${st.n} staged ${which === 'perks' ? 'perk' : 'talent'} pick${st.n > 1 ? 's' : ''}? Nothing has been spent.`, { yes: 'Throw them away', no: 'Keep choosing', danger: true }))) return false;
    st.clear(); refresh(); return true;
  }
  /** Staged picks the server (or a level change) has made impossible are dropped quietly. */
  function prune() {
    for (const id of PS.list) if (S.perks.includes(id) || !S.src?.forest.byId.has(id)) PS.drop(id);
    for (const x of TS.list) if (S.talents[x.skill]?.[x.tier]) TS.drop(`${x.skill}:${x.tier}`);
  }
  // closing a window with picks still staged asks first (the X, Esc, the hotkey and the menu button all come through here)
  for (const [p, which] of [[skills, 'talents'], [perks, 'perks']]) {
    const close0 = p.close.bind(p); let asking = false;
    p.close = () => {
      const st = which === 'perks' ? PS : TS;
      if (!st.n || p.root.hidden) return close0();
      if (asking) return;
      asking = true;
      confirmBox(`You have ${st.n} staged ${which === 'perks' ? 'perk' : 'talent'} pick${st.n > 1 ? 's' : ''} you have not accepted. Close and throw ${st.n > 1 ? 'them' : 'it'} away?`, { yes: 'Close without accepting', no: 'Keep choosing', danger: true })
        .then(yes => { asking = false; if (yes) { st.clear(); close0(); refresh(); } });
    };
  }
  // Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) step through the staged picks of the window that is open
  window.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || (e.code !== 'KeyZ' && e.code !== 'KeyY')) return;
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const st = perks.isOpen && (PS.canUndo || PS.canRedo) ? PS : skills.isOpen && (TS.canUndo || TS.canRedo) ? TS : null;
    if (!st) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.code === 'KeyY' || e.shiftKey) st.redo(); else st.undo();
    prune(); refresh();
  }, true);

  // ================================================================ Perk Forest window
  let graph = null;
  const perkBody = { bar: null, side: null, graphHost: null };
  function buildPerkFrame() {
    perkBody.bar = h('div.pf-bar');
    perkBody.graphHost = h('div.pf-host');
    perkBody.side = h('div.pf-foot');
    perkBody.stage = h('div.pf-stage');
    perks.fill(perkBody.top = h('div.pf-top'), perkBody.bar, perkBody.stage, perkBody.graphHost, perkBody.side);
    graph = createPerkGraph(perkBody.graphHost, { describe: perkTipHtml, onTake: takePerk, onRefund: refundPerk });
    // play-test 2 Q23: a search box over the forest — rings and zooms to every node whose name or card holds the words
    const count = h('em', { 'aria-live': 'polite' });
    const input = h('input', { type: 'search', placeholder: 'Search the forest…', 'aria-label': 'Search the perk forest', dataset: { k: 'pfsearch' },
      oninput: () => runSearch(input.value, count, false), onkeydown: e => { e.stopPropagation(); if (e.key === 'Enter') runSearch(input.value, count, true); if (e.key === 'Escape') { input.value = ''; runSearch('', count, false); input.blur(); } } });
    perkBody.search = h('div.pf-search.pf-overlay', {}, input, count);
    perkBody.graphHost.appendChild(perkBody.search);
  }
  function runSearch(q, count, zoom) {
    if (!graph || !S.src) return [];
    const strip = t => String(t || '').replace(/<[^>]+>/g, ' ');
    const ids = searchForest(S.src.forest, q, n => strip(perkTipHtml(n.id)));
    const n = graph.setSearch(ids);
    count.textContent = q.trim() ? (n ? `${n} found` : 'none') : '';
    if (n && (zoom || n <= 24)) graph.fitIds(ids);
    else if (!q.trim()) graph.fit();
    perkBody.lastSearch = ids;
    return ids;
  }
  function drawPerks() {
    if (!perks.isOpen) return;
    if (!S.src) { perks.fill(h('p.empty', {}, 'Reading the forest…')); graph = null; return; }
    if (!graph || !perks.body.contains(perkBody.graphHost)) buildPerkFrame();
    prune();
    const level = lvl(), st = stagedForest(S.src, S.perks, PS.list, level, S.bonus, S.server.perks ? S.serverLeft : null);
    const left = st.left;
    perks.setTitle('Perk Forest', `${pointsText(left, st.staged)} · ${st.spent} spent`);
    const b = banner('perks');
    perkBody.top.replaceChildren(...(b ? [b] : []));
    const arms = S.src.forest.arms || [];
    perkBody.bar.replaceChildren(...[
      h('span.pf-points' + (left ? '.has' : ''), { dataset: { tip: 'One point a level, and an extra one every fifth level.' } }, h('b', {}, String(left)), ` left`, st.staged ? h('i.pf-staged', {}, `, ${st.staged} staged`) : null),
      h('span.pf-arms', {}, ...arms.map(a => h('button.pf-arm', { type: 'button', style: `--arm:${a.color}`, dataset: { tip: a.blurb || a.name }, onclick: () => focusArm(a) }, a.name))),
      h('span.grow'),
      h('button.ghost.small', { type: 'button', 'aria-label': 'Zoom in', onclick: () => graph.zoom(1.3) }, '+'),
      h('button.ghost.small', { type: 'button', 'aria-label': 'Zoom out', onclick: () => graph.zoom(1 / 1.3) }, '−'),
      h('button.ghost.small', { type: 'button', onclick: () => graph.fit() }, 'Whole forest'),
      !S.server.perks && S.history.length ? h('button.ghost.small', { type: 'button', onclick: undoPerk }, 'Undo') : null,
      !S.server.perks && S.perks.length ? h('button.ghost.small.x', { type: 'button', onclick: () => { S.history.push([...S.perks]); S.perks = []; savePreview(); refresh(); } }, 'Reset') : null,
    ].filter(Boolean));
    // T28: the staged-picks bar is always there (so Undo / Redo / Accept never move under the pointer)
    perkBody.stage.replaceChildren(stageBar('perks'));
    graph.set(S.src.forest, st.state, { arms });
    const tot = perkTotals(S.src, [...S.perks, ...PS.list]);
    const lines = Object.entries(tot).map(([k, v]) => `${v > 0 ? '+' : ''}${Math.round(v * (k === 'spellPower' ? 100 : 1) * 10) / 10}${STAT_NAME[k] || ' ' + k}`);
    perkBody.side.replaceChildren(h('p.pf-help', {}, 'Drag to look around, wheel or pinch to zoom. Click a ', h('b.g', {}, 'glowing'), ' node next to one you hold to stage it (blue) — click it again to take it back, press Accept to spend the points; right-click (or hold) a taken one at the end of a path to hand it back', S.server.perks ? ' (an Unbinder in town does that, for a little gold).' : '.'),
      ...(lines.length ? [h('p.pf-totals', {}, h('b', {}, PS.n ? 'Your perks, with the staged ones: ' : 'Your perks: '), lines.join(' · '))] : []));
  }
  function focusArm(a) {
    const nodes = S.src.forest.nodes.filter(n => n.arm === a.key);
    const far = nodes.sort((x, y) => Math.hypot(y.x, y.y) - Math.hypot(x.x, x.y))[Math.floor(nodes.length / 2)];
    if (far) graph.focus(far.id);
  }
  function perkTipHtml(id) {
    const n = S.src?.forest.byId.get(id); if (!n) return null;
    const st = stagedForest(S.src, S.perks, PS.list, lvl(), S.bonus, S.server.perks ? S.serverLeft : null).state.get(id);
    const arm = (S.src.forest.arms || []).find(a => a.key === n.arm);
    const say = st === 'taken' ? (n.kind === 'hub' ? '<div class="tip-sub">Every arm starts here.</div>' : (S.server.perks ? '<div class="good">Yours. An Unbinder in town can hand it back (the end of a path only).</div>' : '<div class="good">Yours. Right-click to hand it back (only the end of a path).</div>'))
      : st === 'staged' ? '<div class="good">Staged — not spent yet. Click it again to take it back; Accept keeps it.</div>'
      : st === 'open' ? '<div class="good">Click to stage it — 1 point. Nothing is spent until you press Accept.</div>' : st === 'reach' ? '<div class="bad">Next to your path, but you have no points left.</div>'
        : '<div class="bad">Take a perk that connects to this one first.</div>';
    return `<div class="tip-title">${esc(n.name || n.id)}</div><div class="tip-sub">${esc(KIND_NAME[n.kind] || 'Perk')}${arm ? ` · ${esc(arm.name)}` : n.oddball ? ' · between the arms' : ''}</div>${n.desc && n.desc !== n.name ? `<hr><div>${esc(n.desc)}</div>` : ''}${say}`;
  }
  function takePerk(id) {
    if (PS.has(id)) return unstagePerk(id);                         // a second click takes a staged perk back
    const c = stageCheck(S.src, S.perks, PS.list, lvl(), S.bonus, id, S.server.perks ? S.serverLeft : null);
    if (!c.ok) { if (!S.perks.includes(id) && id !== S.src.forest.start?.id) hud?.toast(c.why, 'warn'); return; }
    PS.add(id);
    refresh();
  }
  /** Take a staged perk back out; staged perks that hung off it go with it. */
  function unstagePerk(id) {
    const gone = stagedDependents(S.src, S.perks, PS.list, id);
    PS.drop(id); for (const g of gone) PS.drop(g);
    if (gone.length) hud?.toast(`${gone.length} staged perk${gone.length > 1 ? 's' : ''} further along that path went with it.`, 'info');
    refresh();
  }
  /** Accept: the staged perks are spent, in the order you clicked them (the server takes them one message each). */
  function acceptPerks() {
    const list = PS.take(); if (!list.length) return;
    const n = net();
    if (S.server.perks && typeof n?.perk === 'function') { for (const id of list) n.perk('take', { id }); hud?.toast(`${list.length} perk${list.length > 1 ? 's' : ''} accepted.`, 'good'); }
    else { S.history.push([...S.perks]); S.perks = [...S.perks, ...list]; savePreview(); }
    refresh();
  }
  function refundPerk(id) {
    if (PS.has(id)) return unstagePerk(id);
    const c = refundCheck(S.src, S.perks, id);
    if (!c.ok) { hud?.toast(c.why, 'warn'); return; }
    const n = net();
    if (S.server.perks && typeof n?.perk === 'function') { n.perk('refund', { id }); return; }
    S.history.push([...S.perks]); S.perks = S.perks.filter(x => x !== id); savePreview();
    refresh();
  }
  function undoPerk() { const prev = S.history.pop(); if (prev) { S.perks = prev; savePreview(); refresh(); } }

  // ================================================================ badges + wiring
  let lastLevel = 0;
  function badges() {
    if (!S.src) return;
    const level = lvl();
    const ladder = skillLadder(S.src, me()?.cls || 'warrior', level, bar());
    const w = talentPicksWaiting(S.src, ladder, S.talents, level);
    const left = S.serverLeft ?? forestState(S.src, S.perks, level, S.bonus).left;
    // badges only ever show a positive whole number (the server's perkPoints is an object — it once printed "[object Object]")
    const num = v => { const n = Number(typeof v === 'object' && v ? v.left : v); return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : ''; };
    document.getElementById('menu-skills')?.querySelector('b')?.replaceChildren(num(w));
    document.getElementById('menu-perks')?.querySelector('b')?.replaceChildren(num(left));
  }
  function refresh() { drawSkills(); drawPerks(); badges(); }
  setInterval(() => { const l = lvl(); if (l !== lastLevel) { lastLevel = l; refresh(); } }, 1000);

  function fromYou(y) {
    if (!y) return;
    if (y.talents && typeof y.talents === 'object') {
      const t = talentsFromServer(y.talents);
      S.talents = t.picks; S.trees = { ...S.trees, ...t.trees }; S.server.talents = true;
    }
    const pk = perksFromServer(y.perks);
    if (pk) { S.perks = pk.perks; if (pk.left != null) S.serverLeft = pk.left; S.server.perks = true; }
    // C's rules.build: perkPoints is { total, spent, left }; talentTree is the server's own tree view (node ids it accepts)
    if (y.perkPoints != null) S.serverLeft = typeof y.perkPoints === 'object' ? (Number.isFinite(y.perkPoints.left) ? y.perkPoints.left : null) : y.perkPoints;
    if (Array.isArray(y.talentTree) && y.talentTree.length) { const t = talentsFromServer(y.talentTree); S.trees = { ...S.trees, ...t.trees }; }
    if (y.bonusPerks != null) S.bonus = y.bonusPerks;
    // the server's laid-out forest (C's forestView: plain JSON) wins over the local one
    const fv = y.forest || y.perkForest;
    if (fv && Array.isArray(fv.nodes) && fv.nodes.length) { S.forestView = forestFromJson(fv); if (S.src) S.src.forest = S.forestView; }
  }
  // The server is the store only once it says so: `you.talents` / `you.perks` in joined (C's rules.build), or a pick it
  // accepted. `net.talent` existing is not enough — the rules may still answer 'notReady', and then the window plans
  // in preview instead of silently doing nothing.
  function notReady(which, r) {
    if (r.why !== 'notReady') return false;
    S.server[which] = false;
    hud?.toast(`${r.msg || 'The server cannot store this yet.'} Planning in preview.`, 'info');
    refresh();
    return true;
  }
  function wire(n) {
    n.on('joined', j => { S.server.talents = !!j.you?.talents; S.server.perks = !!perksFromServer(j.you?.perks); fromYou(j.you); loadPreview(); refresh(); });
    n.on('you', p => { fromYou(p); if (p.level != null || p.bar || p.talents || p.talentTree || p.perks || p.perkPoints != null) refresh(); });
    n.on('talentR', r => {
      if (!r.ok) { if (!notReady('talents', r)) hud?.toast(r.msg || r.why || 'You cannot pick that.', 'warn'); return; }
      if (r.talents) { const t = talentsFromServer(r.talents); S.talents = t.picks; S.trees = { ...S.trees, ...t.trees }; }
      else if (r.skill && r.picks) S.talents = { ...S.talents, [r.skill]: r.picks };
      S.server.talents = true; hud?.toast('Talent chosen.', 'good'); refresh();
    });
    n.on('perkR', r => {
      if (!r.ok) { if (!notReady('perks', r)) hud?.toast(r.msg || r.why || 'You cannot take that.', 'warn'); return; }
      const pk = perksFromServer(r.perks); if (pk) S.perks = pk.perks;
      if (r.left != null) S.serverLeft = r.left;
      S.server.perks = true; refresh();
    });
  }

  return {
    skills, perks, wire, refresh, ready, state: S,
    /** T28: what is staged, and the same actions the buttons run (specs). */
    stage: { get perks() { return PS.list; }, get talents() { return TS.list; }, perkStage: PS, talentStage: TS, takePerk, acceptPerks, acceptTalents },
    /** Test hook: the graph (screen positions of nodes) and the current source. */
    get graph() { return graph; }, get source() { return S.src; },
  };
}
