// Death recap (docs/02 §21): what killed you, the damage you took this room (from the Ledger), the purse you left,
// and one button back to the last lamp-post. Iron Wick saves end here instead.
import { el, btn, hp } from './menukit.js';
export const death = {
  id: 'death', title: 'You fell', noEscape: true,
  render(root, ctx, args, router) {
    const g = ctx.game || {}, m = ctx.meter || g.meter;
    const taken = m?.report ? m.report('taken').find(r => r.id === 'player') : null;
    const top = (taken?.sources || []).slice().sort((a, b) => b.total - a.total).slice(0, 4);
    root.append(el('div', { class: 'lf-frame small lf-death' },
      el('h2', { class: 'lf-title', text: 'THE LANTERN GUTTERS' }),
      el('p', { class: 'dim', text: args.by ? `Put out by ${args.by}.` : 'The dark takes you.' }),
      top.length ? el('div', { class: 'col' }, el('h3', { class: 'lf-h', text: 'What hurt you in this room' }), ...top.map(s => el('div', { class: 'row between' }, el('span', { text: s.name }), el('b', { text: hp(s.total) })))) : null,
      args.purse ? el('p', { text: `You dropped a purse of ${hp(args.purse)} pennies where you fell. Go back for it.` }) : null,
      el('div', { class: 'row end' }, g.ironWick ? btn('Return to title', () => { router.closeAll(); ctx.actions.quitToTitle?.(); }, { cls: 'primary', 'data-autofocus': '' })
        : btn('Relight at the lamp-post ▸', () => { router.closeAll(); ctx.actions.respawn?.(); }, { cls: 'primary', 'data-autofocus': '' }))));
  },
};
export const screens = [death];
