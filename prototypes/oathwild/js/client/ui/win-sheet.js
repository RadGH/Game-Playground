// The character sheet: level and XP, the six attributes (with where each point comes from, green when raised, red when
// lowered — lessons rule 5) and unspent attribute points, every number the sheet works out (each with its unit), the
// classes taken, the non-combat skills, background and gold. Every row has the one tooltip card.
//
//   app.openWindow('sheet') → .win-sheet  (.sheet-attr[data-attr], [data-act="attr"][data-attr])
import { openWin, esc } from './kit.js';
import { tipAttrs } from './tip.js';
import { glyph, uiIcon } from './icons.js';
import { sheetOf } from '../../rules/sheet.js';
import { ATTRS, attrPointsLeft } from '../../rules/attributes.js';
import { xpToReach, levelCap } from '../../rules/levels.js';
import { classDef } from '../../rules/classes.js';
import { roundOneSkills, skillValue, xpToNext } from '../../rules/skills-use.js';
import { fmt, hp, range, sign, pctOf } from '../../../../../shared/format.js';

const SCHOOL = { fire: 'Fire', ice: 'Frost', lightning: 'Lightning', arcane: 'Arcane', shadow: 'Shadow', holy: 'Holy', nature: 'Nature', poison: 'Poison', physical: 'Physical' };

export function open(app) {
  const w = openWin({ id: 'sheet', title: 'Character', size: 'wide', cls: 'win-sheet', render: (body, tab, w) => render(app, body, w), foot: (el, w) => foot(app, el, w) });
  if (!w._on) { w._on = true; const off = app.on('me', () => { if (w.open) w.render(); else off(); }); }
  return w;
}

function bar(k, cls = '') { return `<i class="sheet-meter ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, k)) * 100)}%"></i></i>`; }

function render(app, body, w) {
  const c = app.me?.char;
  if (!c) return '<p class="ow-empty">Your character is still on the way.</p>';
  const rules = app.rules, s = sheetOf(rules, c), A = rules.data.attributes;
  const cap = levelCap(rules);
  const lo = xpToReach(rules, c.level), hi = c.level >= cap ? lo : xpToReach(rules, c.level + 1);
  const xpK = c.level >= cap ? 1 : (c.xp - lo) / Math.max(1, hi - lo);
  const left = attrPointsLeft(rules, c);
  const pending = app.me.pending || 0;
  const attrs = ATTRS.map(k => {
    const b = s.attrs[k], chosen = b.base + b.level, diff = b.total - chosen;
    const parts = [b.level ? sign(b.level, { decimals: 0 }) : '', b.class ? sign(b.class, { decimals: 0 }) : '', b.gear ? sign(b.gear, { decimals: 0 }) : '', b.bonus ? sign(b.bonus, { decimals: 0 }) : ''].filter(Boolean);
    const tone = diff > 0 ? 'ow-good' : diff < 0 ? 'ow-bad' : '';
    return `<div class="sheet-attr" data-attr="${k}">
      <button type="button" class="sheet-attr-main" ${tipAttrs('attr', { id: k })}><span class="sheet-attr-short">${esc(A.short?.[k] || k.toUpperCase())}</span><span class="sheet-attr-name">${esc(A.names[k])}</span><b class="sheet-attr-val ${tone}">${fmt(b.total)}</b>${parts.length ? `<small class="ow-dim">(${esc(fmt(b.base))} ${esc(parts.join(' '))})</small>` : ''}</button>
      ${left > 0 ? `<button type="button" class="ow-btn ow-small sheet-plus" data-act="attr" data-attr="${k}" aria-label="Raise ${esc(A.names[k])}">${glyph('plus', 18)}</button>` : ''}</div>`;
  }).join('');
  const stat = (label, value, tip = null) => `<div class="sheet-stat"${tip ? ` ${tipAttrs('text', { title: label, text: tip })} tabindex="0"` : ''}><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  const spellRows = [['int', 'Arcane, fire, frost, storm and shadow'], ['wis', 'Holy and nature'], ['cha', 'Songs and companions']].map(([k, what]) => stat(`Spell power (${A.names[k]})`, range(s.spell[k][0], s.spell[k][1]), `${what} spells roll from this range before their own share.`));
  const schools = Object.entries(s.school || {}).filter(([, v]) => v).map(([k, v]) => stat(`${SCHOOL[k]} damage`, `${sign(v, { decimals: 1 })}%`));
  const classes = (c.classOrder || Object.keys(c.classLevels || {})).map(k => {
    const d = classDef(rules, k);
    return `<button type="button" class="sheet-class" data-cls="${esc(k)}" ${tipAttrs('class', { cls: k })}><b>${esc(d?.name || 'Class')}</b><span>Level ${fmt(c.classLevels[k])}${c.paths?.[k] && d?.paths?.[c.paths[k]] ? ` · ${esc(d.paths[c.paths[k]].name)}` : ''}</span></button>`;
  }).join('');
  const skills = roundOneSkills(rules).map(id => {
    const v = skillValue(c, id), xp = c.skills?.[id]?.xp || 0, need = xpToNext(rules, v);
    return `<button type="button" class="sheet-skill" ${tipAttrs('skill', { id })}><span>${esc(rules.data.skillsUse.skills[id].name)}</span><b>${fmt(v)}</b>${bar(xp / Math.max(1, need), 'is-skill')}</button>`;
  }).join('');
  const bg = rules.data.backgrounds.backgrounds[c.background];
  return `<div class="sheet-wrap">
    <section class="sheet-head ow-card">
      <div><h3 class="sheet-name">${esc(c.name)}</h3><span class="ow-dim">Level ${fmt(c.level)}${bg ? ` · ${esc(bg.name)}` : ''} · ${fmt(c.gold || 0)} gold</span></div>
      <div class="sheet-xp" ${tipAttrs('text', { title: 'Experience', text: c.level >= cap ? `Level ${cap} is as high as anyone can go for now.` : `${fmt(c.xp - lo)} of ${fmt(hi - lo)} experience to level ${c.level + 1}.` })} tabindex="0">${bar(xpK, 'is-xp')}<small>${c.level >= cap ? 'Highest level' : `${fmt(c.xp)} / ${fmt(hi)} XP`}</small></div>
      ${pending ? `<button type="button" class="ow-btn ow-primary" data-act="levelup" data-primary>${glyph('level', 18)}Level up${pending > 1 ? ` (${fmt(pending)})` : ''}</button>` : ''}
    </section>
    <div class="sheet-cols">
      <section class="ow-section"><h3>Attributes${left > 0 ? ` <span class="sheet-points">${fmt(left)} point${left > 1 ? 's' : ''} to spend</span>` : ''}</h3><div class="sheet-attrs">${attrs}</div>
        <h3 class="sheet-sub">Classes</h3><div class="sheet-classes">${classes || '<p class="ow-dim">None yet.</p>'}</div>
        <h3 class="sheet-sub">Skills</h3><div class="sheet-skills">${skills}</div></section>
      <section class="ow-section"><h3>Body</h3><div class="sheet-stats">
        ${stat('Health', hp(s.maxHp))}${stat('Mana', hp(s.maxMp))}${stat('Stamina', hp(s.maxStamina), 'Sprinting, dodging, power attacks and blocking use stamina.')}
        ${stat('Health back', `${fmt(s.hpRegen, { decimals: 1 })}/s`)}${stat('Mana back', `${fmt(s.mpRegen, { decimals: 1 })}/s`)}${stat('Stamina back', `${fmt(s.staminaRegen, { decimals: 1 })}/s`)}
        ${stat('Move speed', `${fmt(s.moveSpeed, { decimals: 1 })} m/s`)}${stat('Carry', `${fmt(s.carried, { decimals: 1 })} / ${fmt(s.carry)} kg`)}
      </div>
      <h3 class="sheet-sub">Defence</h3><div class="sheet-stats">
        ${stat('Armour', fmt(s.armor), 'Takes a share off every physical hit.')}${stat('Magic resistance', fmt(s.magicResist), 'Takes a share off every spell that hits you.')}
        ${stat('Dodge', pctOf(s.dodge, 1))}${stat('Block chance', pctOf(s.blockChance, 1))}${s.resistAll ? stat('All resistances', `${sign(s.resistAll, { decimals: 1 })}%`) : ''}${s.thorns ? stat('Thorns', fmt(s.thorns)) : ''}
      </div>
      <h3 class="sheet-sub">Attack</h3><div class="sheet-stats">
        ${stat('Weapon damage', range(s.melee[0], s.melee[1]))}${s.ranged ? stat('Bow damage', range(s.ranged[0], s.ranged[1])) : ''}${s.offhand ? stat('Off-hand damage', range(s.offhand[0], s.offhand[1])) : ''}
        ${stat('Attacks', `every ${fmt(s.attackEvery, { decimals: 2 })}s`)}${stat('Critical chance', pctOf(s.critChance, 1))}${stat('Critical damage', `+${pctOf(s.critDamage, 0)}`)}
        ${s.lifeSteal ? stat('Life steal', pctOf(s.lifeSteal, 1)) : ''}${s.hastePct ? stat('Haste', `${sign(s.hastePct, { decimals: 1 })}%`) : ''}${s.cooldownPct ? stat('Faster cooldowns', `${fmt(s.cooldownPct, { decimals: 1 })}%`) : ''}
      </div>
      <h3 class="sheet-sub">Magic</h3><div class="sheet-stats">${spellRows.join('')}${stat('Healing power', range(s.heal[0], s.heal[1]))}${schools.join('')}${s.petPct ? stat('Companion damage', `${sign(s.petPct, { decimals: 1 })}%`) : ''}</div>
      </section>
    </div></div>`;
}

function foot(app, el, w) {
  el.innerHTML = `<button type="button" class="ow-btn" data-act="bag">${uiIcon('bag', 20)}Bag</button><button type="button" class="ow-btn" data-act="classes">${uiIcon('skills', 20)}Classes</button><button type="button" class="ow-btn" data-act="talents">${uiIcon('perks', 20)}Talents</button>`;
  for (const k of ['bag', 'classes', 'talents']) el.querySelector(`[data-act="${k}"]`).onclick = () => { w.close(); app.openWindow(k); };
  w.body.querySelectorAll('[data-act="attr"]').forEach(b => { b.onclick = () => app.act('attr', { key: b.dataset.attr }); });
  w.body.querySelector('[data-act="levelup"]')?.addEventListener('click', () => { w.close(); app.openWindow('levelup'); });
  w.body.querySelectorAll('.sheet-class').forEach(b => { b.onclick = () => { w.close(); app.openWindow('classes', { cls: b.dataset.cls }); }; });
}
