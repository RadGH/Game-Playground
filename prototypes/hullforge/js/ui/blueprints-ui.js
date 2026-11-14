// Shipyard → Blueprints: save the design under a name, load a saved one (it is rebuilt from the parts you own and
// the structure you pay for — anything missing is listed before you commit), delete. Opened from the Shipyard's top
// bar; the maths lives in sim/blueprints.js. `ctx` = { G, grid(), apply(plan), close() } from ui/builder.js.

import { el, btn, $ , num, credits as cr } from './dom.js';
import { saveBlueprint, deleteBlueprint, blueprintSummary, planBlueprint, MAX_BLUEPRINTS } from '../sim/blueprints.js';
import { BLOCKS } from '../data/blocks.js';
import { save } from '../sim/state.js';
import { ask } from '../../../../shared/dialog.js';
import { play } from '../core/audio.js';

export function openBlueprints(ctx) {
  const { G } = ctx;
  const back = el('div', { class: 'modal-back bp-back' });
  const m = el('div', { class: 'modal hf-modal wide bp-modal' });
  back.append(m); $('#panels').append(back);
  const close = () => { back.remove(); removeEventListener('keydown', onKey, true); };
  back.closePanel = close;
  const onKey = e => { if (e.code === 'Escape' && !document.querySelector('.gdlg-modal')) { e.stopImmediatePropagation(); close(); } };
  addEventListener('keydown', onKey, true);
  back.addEventListener('click', e => { if (e.target === back) close(); });
  const date = iso => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };

  function list() {
    const input = el('input', { type: 'text', maxlength: 40, placeholder: 'Name this design', value: G.shipName || '', 'aria-label': 'Blueprint name' });
    const doSave = () => {
      const exists = (G.blueprints || []).some(b => b.name.toLowerCase() === input.value.trim().toLowerCase());
      const go = () => { const bp = saveBlueprint(G, ctx.grid(), input.value); save(G); play('rebuilt'); list(); m.querySelector(`[data-bp="${CSS.escape(bp.name)}"]`)?.classList.add('fresh'); };
      if (exists) ask({ title: 'Replace this blueprint?', text: `A design called "${input.value.trim()}" is already saved.`, ok: 'Replace' }).then(ok => ok && go()); else go();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });
    const g = ctx.grid(); let parts = 0; for (const b of g.cells.values()) if (b.item) parts++;
    const rows = (G.blueprints || []).map(bp => {
      const s = blueprintSummary(bp);
      const kinds = Object.entries(s.kinds).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${BLOCKS[k].name} ×${num(n)}`).join(' · ');
      return el('div', { class: 'bp-row', 'data-bp': bp.name },
        el('div', { class: 'bp-info' }, el('b', {}, bp.name), el('small', {}, `${num(s.blocks)} blocks · ${num(s.parts)} parts · saved ${date(bp.at)}`), el('small', { class: 'dim' }, kinds)),
        btn('Load', () => preview(bp), 'small primary'),
        btn('Delete', async () => { if (await ask({ title: 'Delete this blueprint?', text: `"${bp.name}" will be gone for good.`, ok: 'Delete', danger: true })) { deleteBlueprint(G, bp.name); save(G); list(); } }, 'small danger'));
    });
    m.replaceChildren(
      el('div', { class: 'row between' }, el('h2', {}, 'Blueprints'), btn('Close', close, 'small', { 'data-key': 'Esc' })),
      el('div', { class: 'bp-save' }, el('div', { class: 'col grow' }, el('span', { class: 'hint' }, `Save this design: ${num(g.cells.size)} blocks, ${num(parts)} parts`), input), btn('Save', doSave, 'primary')),
      el('h3', {}, `Saved designs (${num(rows.length)} of ${num(MAX_BLUEPRINTS)})`),
      rows.length ? el('div', { class: 'bp-list' }, ...rows) : el('p', { class: 'hint' }, 'None yet. A blueprint keeps the shape and the kind of every part; loading it fits the parts you own.'));
    input.focus(); input.select();
  }

  function preview(bp) {
    const plan = planBlueprint(bp, G.items, ctx.grid());
    const can = plan.hasBridge && G.credits >= plan.net;
    const missN = plan.missing.reduce((a, x) => a + x.n, 0);
    const kv = (a, b, cls = '') => [el('span', {}, a), el('b', { class: cls }, b)];
    m.replaceChildren(
      el('div', { class: 'row between' }, el('h2', {}, `Load "${bp.name}"`), btn('Back', list, 'small')),
      el('div', { class: 'kv bp-kv' },
        ...kv('Blocks in the design', num(plan.blocks)),
        ...kv('Blocks you get', num(plan.placed), plan.placed < plan.blocks ? 'amber' : 'good'),
        ...kv('Structure cost', cr(plan.cost)),
        ...kv('Refund for your current hull', cr(plan.refund)),
        ...kv(plan.net >= 0 ? 'You pay' : 'You get back', cr(Math.abs(plan.net)), plan.net > G.credits ? 'bad' : 'amber'),
        ...kv('Parts missing', missN ? num(missN) : 'None', missN ? 'bad' : 'good'),
        ...(plan.dropped ? kv('Blocks left out (held on by a missing part)', num(plan.dropped), 'bad') : [])),
      missN ? el('div', { class: 'bp-missing' }, el('h4', {}, 'Not in your hold'), el('ul', {}, ...plan.missing.map(x => el('li', {}, `${x.name} ×${num(x.n)}`))), el('span', { class: 'hint' }, 'Buy or craft these, then load again to fill the gaps.')) : '',
      !plan.hasBridge ? el('p', { class: 'why' }, 'This design has no bridge you can fit.') : plan.net > G.credits ? el('p', { class: 'why' }, `You need ${cr(plan.net - G.credits)} more.`) : '',
      el('div', { class: 'row end' }, btn('Back', list), btn(missN ? 'Load what I can' : 'Load design', () => { ctx.apply(plan); close(); }, can ? 'primary' : '', { disabled: !can, 'data-act': 'load-bp' })),
      el('p', { class: 'hint' }, 'Loading is one step: Undo puts your ship and credits back.'));
  }
  list();
}
