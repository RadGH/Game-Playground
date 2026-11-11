// Skills on screen (M9): the Path choice at level 3, the skill tree (K), the six-slot action bar contents, and the
// player-facing text of a skill at a rank ({mult} {dmg} {secs} filled in from the rank's numbers).
import { atRank, rankOf, costOf, synergyOf } from '../sim/skills.js';
import { PATH_BONUS } from '../rules/sheet.js';
const bonusText = id => { const b = PATH_BONUS[id]; if (!b) return ''; return [b.hpPct && `+${b.hpPct}% health`, b.armourPct && `+${b.armourPct}% armour`, b.dodge && `+${b.dodge}% dodge`].filter(Boolean).join(', '); };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const RES_NAME = { rage: 'Temper', energy: 'Energy', mana: 'Mana', health: '% health' };
/** An icon for a skill from what it does (until the art pass). */
export function skillIcon(sk) {
  if (!sk) return '·';
  const all = []; const walk = es => { for (const e of es || []) { all.push(e); walk(e.effects); } }; walk(sk.effects);
  const has = d => all.some(e => e.do === d), ty = all.find(e => e.type)?.type;
  if (has('interrupt')) return '✋'; if (has('taunt')) return '📣'; if (has('dash')) return '💨'; if (has('shield')) return '🛡';
  if (has('heal') || has('hot')) return '✚'; if (has('buff') && !has('weapon')) return '✨'; if (has('mark')) return '🎯';
  if (ty === 'fire') return '🔥'; if (ty === 'frost') return '❄'; if (ty === 'storm') return '⚡'; if (ty === 'poison') return '☠'; if (ty === 'shadow') return '🌑';
  if (has('area')) return '🌀'; if (has('weapon')) return '🗡'; return '✦';
}
/** Fill {mult} {dmg} {secs} from the numbers at this rank and level. */
export function skillText(sk, rank, level, ch = null, skills = null) {
  const r = atRank(sk, Math.max(1, rank)), all = [];
  const walk = es => { for (const e of es || []) { all.push(e); walk(e.effects); } }; walk(r.effects);
  const syn = ch && skills ? synergyOf(skills, ch, sk.id) : { damage: 1, heal: 1 };
  const w = all.find(e => e.do === 'weapon'), d = all.find(e => e.base), s = all.find(e => e.secs);
  const num = d ? Math.round((d.base[0] + d.base[1] * level) * (d.do === 'heal' || d.do === 'hot' || d.do === 'shield' ? syn.heal : syn.damage)) : null;
  return String(sk.desc || '').replace('{mult}', w ? Math.round(w.mult * syn.damage * 100) + '%' : '').replace('{dmg}', num ?? '').replace('{secs}', s ? s.secs : '');
}

export function createSkillsUI({ content, send, getChar, nope }) {
  const S = content.skills, root = document.createElement('div'); root.className = 'skills-ui'; root.hidden = true; document.body.append(root);
  let pathAsked = false, specAsked = false, tab = 'path';
  function toggle(force) { root.hidden = force != null ? !force : !root.hidden; if (!root.hidden) draw(); }
  function draw(ch = getChar()) {
    if (root.hidden || !ch) return;
    if (!ch.path && ch.level >= 3) return drawPaths(ch);
    if (ch.path && !ch.spec && ch.level >= 10 && tab !== 'path' && Object.keys(content.specs || {}).length) return drawSpecs(ch);
    const specTrees = ch.spec ? (content.specs?.[ch.spec]?.trees || []) : [];
    const tabs = [['path', content.paths[ch.path]?.tree?.name || 'Path'], ...specTrees.map(t => [t.id, t.name])];
    if (!tabs.some(t => t[0] === tab)) tab = specTrees[0]?.id || 'path';
    const own = Object.values(S).filter(s => tab === 'path' ? (s.owner === ch.path && s.tree) : (s.owner === ch.spec && s.tree === tab));
    const wand = Object.values(S).filter(s => s.owner === 'wanderer');
    const P = content.paths[ch.path];
    const node = s => {
      const rank = rankOf(ch, s), max = s.maxRank || 1, can = (ch.skillPoints || 0) > 0 && rank < max && ch.level >= (s.reqLevel || 1) && (s.prereq || []).every(p => ch.skills?.[p] > 0) && s.owner !== 'wanderer';
      const locked = ch.level < (s.reqLevel || 1) || !(s.prereq || []).every(p => ch.skills?.[p] > 0);
      const cost = s.kind === 'active' ? costOf(S, content.resources, ch, s, Math.max(1, rank)) : null;
      return `<div class="node ${rank ? 'known' : ''} ${locked ? 'locked' : ''} k-${s.kind}" data-id="${s.id}">
        <span class="ic">${skillIcon(s)}</span><div class="txt"><b>${esc(s.name)}</b> <small>${s.kind === 'active' ? '' : s.kind === 'passive' ? '(passive)' : '(boosts ' + esc(S[s.synergy?.skill]?.name || '') + ')'} ${rank}/${max}</small>
        <p>${esc(skillText(s, rank || 1, ch.level, ch, S))}</p>
        <small class="meta">${s.reqLevel > 1 ? `Level ${s.reqLevel}` : ''}${(s.prereq || []).length ? ` · after ${s.prereq.map(p => esc(S[p]?.name || p)).join(', ')}` : ''}${cost && cost.n ? ` · ${cost.n} ${RES_NAME[cost.kind]}` : ''}${s.cast ? ` · ${s.cast}s cast` : s.channel ? ` · ${s.channel}s channel` : ''}${s.cd ? ` · ${s.cd}s cooldown` : ''}</small></div>
        ${can ? `<button class="learn" data-learn="${s.id}" aria-label="Learn ${esc(s.name)}">+</button>` : ''}
        ${s.kind === 'active' && rank ? `<button class="tobar" data-bar="${s.id}" title="Put on the action bar">⇩</button>` : ''}</div>`;
    };
    const rows = {}; for (const s of own) (rows[s.reqLevel || 3] ||= []).push(s);
    root.innerHTML = `<div class="skills-panel"><header><h2>${esc(tab === 'path' ? (P?.tree?.name || 'Skills') : (specTrees.find(t => t.id === tab)?.name || 'Skills'))}</h2><span>${ch.path ? esc(P?.name) : 'Wanderer'} · ${ch.skillPoints || 0} skill point${ch.skillPoints === 1 ? '' : 's'} to spend</span><button class="x" data-close aria-label="Close">×</button></header>
      ${tabs.length > 1 ? `<div class="tabs">${tabs.map(([id, name]) => `<button data-tab="${id}" class="${id === tab ? 'on' : ''}">${esc(name)}</button>`).join('')}</div>` : ''}
      ${ch.path && !ch.spec && ch.level >= 10 ? '<button class="primary pickspec" data-pickspec>Choose your specialization</button>' : ''}
      ${ch.path ? `<div class="tree">${Object.keys(rows).sort((a, b) => a - b).map(L => `<div class="tier"><span class="lv">${L}</span><div class="nodes">${rows[L].map(node).join('')}</div></div>`).join('')}</div>` : `<p class="hint">At level 3 you choose a Path: Fighter, Rogue, Mage or Healer. Until then you fight as a Wanderer.</p>`}
      <h3>Wanderer</h3><div class="nodes wand">${wand.map(node).join('')}</div>
      <h3>Action bar</h3><div class="barset">${[0, 1, 2, 3, 4, 5].map(i => { const id = ch.bar?.[i]; return `<button class="bslot2" data-slot="${i}">${id ? skillIcon(S[id]) + '<small>' + esc(S[id]?.name || '') + '</small>' : '<small>empty</small>'}<b>${i + 1}</b></button>`; }).join('')}</div>
      <p class="hint">Tap ⇩ on a skill, then a slot, to put it there.</p></div>`;
    root.querySelector('[data-close]').onclick = () => toggle(false);
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(); });
    root.querySelector('[data-pickspec]')?.addEventListener('click', () => { tab = 'spec'; draw(); });
    root.querySelectorAll('[data-learn]').forEach(b => b.onclick = () => send({ do: 'learn', skill: b.dataset.learn }));
    let pending = null;
    root.querySelectorAll('[data-bar]').forEach(b => b.onclick = () => { pending = b.dataset.bar; root.querySelectorAll('.bslot2').forEach(x => x.classList.add('pick')); });
    root.querySelectorAll('.bslot2').forEach(b => b.onclick = () => { if (pending) send({ do: 'bar', i: +b.dataset.slot, skill: pending }); else send({ do: 'bar', i: +b.dataset.slot, skill: null }); pending = null; });
  }
  function drawSpecs(ch) {
    const list = Object.entries(content.specs || {}).filter(([, sp]) => (sp.paths || []).includes(ch.path));
    root.innerHTML = `<div class="skills-panel paths"><header><h2>Choose your specialization</h2><span>Level ${ch.level}: three new skill trees, and new armour for some. The trainer in town can change it later, for a price.</span><button class="x" data-close aria-label="Close">×</button></header>
      <div class="path-cards">${list.map(([id, sp]) => `<button class="path-card" data-spec="${id}"><b>${esc(sp.name)}</b><small>${(sp.paths || []).length > 1 ? 'Hybrid · ' : ''}${esc((sp.armour || []).join(', ') || 'no new armour')}</small><p>${esc(sp.blurb || sp.fantasy || '')}</p><span class="starters">${(sp.trees || []).map(t => esc(t.name)).join(' · ')}</span>${S && Object.values(S).some(s => s.owner === id) ? '' : '<em class="soon">(its trees arrive in a later update)</em>'}</button>`).join('')}</div>
      <button data-later>Not yet</button></div>`;
    root.querySelector('[data-close]').onclick = () => toggle(false);
    root.querySelector('[data-later]').onclick = () => { tab = 'path'; draw(); };
    root.querySelectorAll('[data-spec]').forEach(b => b.onclick = () => { if (confirm(`Become a ${content.specs[b.dataset.spec].name}?`)) send({ do: 'spec', spec: b.dataset.spec }); });
  }
  function drawPaths(ch) {
    const P = content.paths;
    root.innerHTML = `<div class="skills-panel paths"><header><h2>Choose your Path</h2><span>Level ${ch.level}: the Wanderer's road forks here. This choice is for good (a specialization comes at level 10).</span><button class="x" data-close aria-label="Close">×</button></header>
      <div class="path-cards">${Object.entries(P).map(([id, p]) => `<button class="path-card pc-${id}" data-path="${id}"><b>${esc(p.name)}</b><small>${esc(RES_NAME[p.resource] || 'Mana')} · ${esc(p.tree?.name || '')}</small><p>${esc(p.blurb)}</p>${bonusText(id) ? `<small class="bonus">Built to take hits: ${esc(bonusText(id))}</small>` : ''}
        <span class="starters">${(p.starter || []).map(s => `${skillIcon(S[s])} ${esc(S[s]?.name || s)}`).join(' · ')}</span></button>`).join('')}</div></div>`;
    root.querySelector('[data-close]').onclick = () => toggle(false);
    root.querySelectorAll('[data-path]').forEach(b => b.onclick = () => { if (confirm(`Walk the ${P[b.dataset.path].name}'s Path? This is for good.`)) send({ do: 'path', path: b.dataset.path }); });
  }
  /** Called on every character update: at level 3 with no Path, offer the choice once. */
  function check(ch) {
    if (ch && !ch.path && ch.level >= 3 && !pathAsked) { pathAsked = true; toggle(true); }
    if (ch && ch.path && !ch.spec && ch.level >= 10 && !specAsked && Object.keys(content.specs || {}).length) { specAsked = true; tab = 'spec'; toggle(true); }
    if (!root.hidden) draw(ch);
  }
  void nope;
  return { toggle, draw, check, get open() { return !root.hidden; } };
}
