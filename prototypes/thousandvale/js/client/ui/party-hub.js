// The Party menu (play-test P18): one window with tabs — Party, Friends, Guild, Mail, Group Finder — instead of five
// buttons and five windows. Each tab is the existing window (friends.js, guild.js, mail.js, callboard.js), DOCKED
// inside: its root is moved into the hub and its header hidden, and its open/close/toggle go through the hub, so
// everything that already calls `friends.panel.open()` (the chat name menu, a mail badge, a hotkey) lands on the
// right tab. The tab buttons carry the old menu ids (menu-friends, menu-mail …) so each module's badge keeps working.
// "Callboard" is called "Group Finder" in the interface (owner, play-test P18).

import { createPanel, h } from '../ui-panel.js';

export const HUB_TABS = [
  { id: 'party', label: 'Party' },
  { id: 'friends', label: 'Friends' },
  { id: 'guild', label: 'Guild' },
  { id: 'mail', label: 'Mail' },
  { id: 'callboard', label: 'Group Finder' },
];

export function createPartyHub({ panels, social, net, hud, chat }) {
  const hub = createPanel({ id: 'partyhub', title: 'Party', width: 440, cls: 'hub-panel', onClose: () => closeCurrent() });
  const tabBar = h('div.hub-tabs', { role: 'tablist' });
  const body = h('div.hub-body');
  const members = h('div.hub-members');
  hub.fill(tabBar, body);
  const T = new Map();
  let current = null, switching = false;

  for (const t of HUB_TABS) {
    const b = h('button.hub-tab', { type: 'button', role: 'tab', id: 'menu-' + t.id + (t.id === 'party' ? '-tab' : ''), dataset: { tab: t.id }, onclick: () => show(t.id) }, t.label, h('b'));
    tabBar.appendChild(b);
    T.set(t.id, { btn: b });
  }

  // docked windows (friends, guild, mail, callboard)
  for (const [id, p] of Object.entries(panels)) {
    if (!p) continue;
    const origOpen = p.open.bind(p), origClose = p.close.bind(p);
    p.root.classList.add('docked');
    p.root.hidden = true;
    body.appendChild(p.root);
    p.open = () => show(id);
    p.close = () => { if (switching) origClose(); else hub.close(); };
    p.toggle = force => { const want = force ?? !(hub.isOpen && current === id); if (want) show(id); else hub.close(); return want; };
    Object.assign(T.get(id), { p, origOpen, origClose });
  }
  // the party tab: the M1 party menu (invite, join link, leave) plus a member list with actions
  const pm = document.getElementById('party-menu');
  if (pm) {
    pm.classList.add('docked'); pm.hidden = true;
    pm.querySelector('h3')?.remove();
    body.appendChild(pm);
    pm.prepend(members);
    Object.assign(T.get('party'), {
      // (toggleMenu focuses the name box; blur it so the P that opened the menu is not typed into it)
      origOpen: () => { social.toggleMenu(true); document.activeElement?.blur?.(); drawMembers(); },
      origClose: () => social.toggleMenu(false),
    });
    const btn = document.getElementById('party-btn');
    if (btn) btn.onclick = () => toggle('party');
  }

  function closeCurrent() { if (!current) return; switching = true; try { T.get(current)?.origClose?.(); } finally { switching = false; } markTabs(); current = null; }
  function show(id) {
    if (!T.has(id)) id = 'party';
    hub.open();
    if (current && current !== id) closeCurrent();
    current = id;
    const t = T.get(id);
    switching = true; try { t.origOpen?.(); } finally { switching = false; }
    hub.setTitle(HUB_TABS.find(x => x.id === id)?.label || 'Party', 'Party · friends · guild · mail · group finder');
    markTabs();
  }
  function toggle(id = 'party') { if (hub.isOpen && current === id) hub.close(); else show(id); }
  function markTabs() { for (const [id, t] of T) t.btn.setAttribute('aria-selected', String(id === current && hub.isOpen)); }

  // the member list (party tab)
  function drawMembers() {
    const party = social.party;
    const mine = net()?.joined?.you?.char;
    if (!party || !party.members?.length) { members.replaceChildren(h('p.tiny', {}, 'You are not in a party. Invite someone by name, or send them your join link.')); return; }
    const lead = party.leader === mine;
    members.replaceChildren(h('ul.hub-list', {}, ...party.members.map(m => h('li' + (m.online ? '' : '.offline'), {},
      h('span.hub-name', {}, party.leader === m.char ? '♛ ' : '', m.name, h('small', {}, ` ${m.level || ''} ${String(m.cls || '').replace(/_/g, ' ')}${m.online ? '' : ' · offline'}`)),
      m.char !== mine && m.online ? h('button.ghost.small', { type: 'button', title: `Whisper ${m.name}`, onclick: () => chat?.whisper?.(m.name) }, 'Whisper') : null,
      lead && m.char !== mine ? h('button.ghost.small', { type: 'button', title: `Make ${m.name} the leader`, onclick: () => net()?.partyOp('lead', { char: m.char }) }, 'Lead') : null,
      lead && m.char !== mine ? h('button.ghost.small.x', { type: 'button', title: `Remove ${m.name} from the party`, onclick: () => net()?.partyOp('kick', { char: m.char }) }, '×') : null))));
  }

  // one alert dot on the Party button when any tab wants you (unread mail, a group ready)
  setInterval(() => {
    const btn = document.getElementById('party-btn'); if (!btn) return;
    const mail = document.getElementById('menu-mail');
    btn.classList.toggle('alert', !!mail?.classList.contains('alert'));
    const q = document.getElementById('menu-callboard');
    btn.classList.toggle('queued', !!q?.classList.contains('queued'));
  }, 1000);

  function wire(n) { n.on('party', () => { if (current === 'party' && hub.isOpen) drawMembers(); }); }
  return { panel: hub, show, toggle, wire, get current() { return hub.isOpen ? current : null; } };
}
