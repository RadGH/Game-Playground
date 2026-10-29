// Tool bank: what the light pen does. Chunky toggle switches with paper labels; only one can be up. Keys 1–6.
// RAIL wears a safety cap until rails are unlocked. Raising a switch only changes what the pen does — the tools'
// effects arrive with their milestones (roads M3, walls M4, orders M5, rails M10).
import { machinePanel } from './panel.js';
import { createSwitchBank } from '../switch.js';

export function mountToolbank(C) {
  const { el, body } = machinePanel({ id: 'toolbank', title: 'TOOL BANK' });
  const bank = createSwitchBank({
    items: C.data.tools.map(t => ({ ...t, locked: !!t.unlock })),
    sound: (s, o) => C.room.play(s, o),
    onChange: v => C.state.set('tool', v),
    onLocked: it => C.print({ who: 'Quartermaster', text: `${it.label} SWITCH IS CAPPED — NOT AVAILABLE YET.` }),
  });
  body.append(bank.el);
  return { el, bank };
}
