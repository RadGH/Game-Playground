// Playing together, on the page: finding the room server, opening or joining a room, and every sheet that goes with it (who you will be, the room, a player, the party, the votes).
// Every list is a real sheet (.modal), so touch, keys and pad all reach it (PLAN rule 7); what must not stop you driving (a vote, an invite) is a bar, like a Moment: Y on a pad or J on keys says yes.
// The page only asks; js/sim/room.js decides. A greyed row is a courtesy, the server refuses anyway.
import { roomBase, findServer, publicRooms, roomLink, socketUrl, seatToken, PUBLIC_SERVER } from './room-link.js';
import { CODE_LETTERS, cleanName } from '../sim/protocol.js';
import { qrSvg } from '../../../tumblefair/js/client/qr.js';
import { account } from '../../../../shared/rgs-account.js';
import { gzipText } from '../sim/save.js';

const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window */ } }, del(k) { try { localStorage.removeItem(k); } catch { /* private window */ } } };
export const PERM_ROWS = [['take', 'Take people'], ['spend', 'Spend money'], ['drive', 'Drive cars'], ['settings', 'Change settings'], ['direct', 'Direct and Stir']];
const WORDS = { 'no such room': 'There is no room with that code.', full: 'That room is full.', busy: 'The server is full just now. Try again in a while.', removed: 'The host has removed you from that room.', update: 'This page is out of date. Reload it.', 'bad save': 'That town could not be read.', 'slow down': 'Too many tries. Wait a minute.' };
const CLOSED = { home: 'The host took the town home.', removed: 'The host removed you from the room.', idle: 'Nobody was doing anything, so the room went to sleep. The code still works.', elsewhere: 'You opened this room somewhere else.', broken: 'Something went wrong with the room. Sorry.', 'room closed': 'The room closed.' };
const VOTE_NAMES = { speed2: 'run at 2x', speed4: 'run at 4x', night: 'skip the night' };
const NOTES = { 'vote.yes': 'Everyone agreed.', 'vote.no': 'Not everyone agreed. It stays as it is.', morning: 'Morning. Back to normal speed.', 'speed.back': 'Back to normal speed.' };
const BACKUP_KEY = 'oddhaven.room.backup', LAST_KEY = 'oddhaven.room.last', ME_KEY = 'oddhaven.me', NAME_KEY = 'oddhaven.name', TOKEN_KEY = 'oddhaven.seat', BACKUP_SECONDS = 120;

export function createCoop({ game, town, shell, el, hands, people, cars, params, project, parent, premades }) {
  const base = roomBase(location, params.get('roomPort'));
  let holds = null, info = null, room = null, code = null, link = null, state = 'off', asked = null, bringing = false, wasHost = false, netDot = null, backupClock = 0, sampling = null, tagBox = null, whoShown = params.has('play');
  const tags = new Map();
  const name = () => cleanName(ls.get(NAME_KEY)) || cleanName(account.known?.name ?? account.known?.username) || '';
  const token = () => params.get('seat') || seatToken({ get: () => ls.get(TOKEN_KEY), set: v => ls.set(TOKEN_KEY, v) });
  const youId = () => town.owner, me = () => room?.players.find(p => p.id === youId()) ?? null, isHost = () => room?.host === youId(), partyRow = () => room?.parties.find(q => q.id === me()?.party) ?? null, isLeader = () => partyRow()?.leader === youId();
  const nameOf = id => room?.players.find(p => p.id === id)?.name ?? 'Someone', body = id => game.personName(id), can = k => isHost() || !!me()?.perms[k];
  const dot = v => { state = v; if (netDot) netDot.dataset.on = v; };
  const row = (label, run, opts = {}) => el('button', { class: `od-big${opts.quiet ? ' quiet' : ''}`, type: 'button', ...(opts.off ? { disabled: '' } : {}), text: opts.off && typeof opts.off === 'string' ? `${label}: ${opts.off}` : label, on: { click: run } });

  // ---- the bar: a vote or an invite. Not a sheet: nothing you are driving stops for it
  const bar = el('div', { class: 'od-ask', hidden: '', role: 'status' }), barText = el('span'), barYes = el('button', { class: 'od-mjump', type: 'button', text: 'Yes', on: { click: () => answer(true) } }), barNo = el('button', { class: 'od-mno', type: 'button', text: 'No', on: { click: () => answer(false) } });
  bar.append(barText, el('div', { class: 'od-mbtns' }, barYes, barNo));
  parent.append(bar);
  function showAsk(text, reply) { asked = { reply }; barText.textContent = text; bar.hidden = false; }
  function clearAsk() { asked = null; bar.hidden = true; }
  function answer(yes) { const a = asked; clearAsk(); a?.reply(yes); }
  function offerBar() {
    if (!room) return;
    const o = room.offers.find(x => x.to === youId());
    if (o) { if (asked?.offer !== o.from) { showAsk(o.ask ? `${nameOf(o.from)} wants to join your party.` : `${nameOf(o.from)} asks you to join their party.`, yes => town.post({ type: 'partyAnswer', from: o.from, yes })); asked.offer = o.from; } return; }
    const v = room.vote;
    if (v && v.by !== youId() && !v.yes.includes(youId())) { if (asked?.vote !== v.what) { showAsk(`${nameOf(v.by)} asks to ${VOTE_NAMES[v.what]}.`, yes => town.post({ type: 'voteAnswer', yes })); asked.vote = v.what; } return; }
    if (asked && !asked.keep) clearAsk();
  }

  // ---- getting in
  function linkFor(first) {
    const hello = async () => { let ticket = null; try { if (await account.user()) ticket = await account.ticket('oddhaven'); } catch { /* a guest, which is fine */ } return { token: token(), name: name(), ...(ticket ? { ticket } : null) }; };
    const open = roomLink({ url: socketUrl(base), hello, retryMs: Number(params.get('roomRetry')) || undefined, first: () => (code ? { type: 'join', code } : first), onState: s => { dot(s); if (s === 'lost') lost(); if (s === 'down') shell.toast('Lost the room. Trying again.'); if (s === 'open' && wasDown) { wasDown = false; } if (s === 'down') wasDown = true; } });
    link = open;
    return open;
  }
  let wasDown = false;
  async function ready() { if (info) return info; if (!base) return null; info = await findServer(base); return info; }
  /** The page's address for this room: the room server's own page where it has one, so a phone only ever meets one certificate. */
  const inviteUrl = () => { const u = new URL(/:856[0-3]$/.test(base) || !/^https?:\/\/\d/.test(base) ? `${base}/prototypes/oddhaven/` : location.href); if (/github\.io|games\.radgh\.com$/.test(location.hostname) && base.includes('oddhaven.games.radgh.com')) return `${base}/?room=${code}`; u.search = `?room=${code}`; return u.href; };
  const noServer = () => shell.modal({ title: 'Play together', body: [el('p', { text: base && base !== PUBLIC_SERVER ? 'The room server is not answering just now. Everything else works on your own; try again in a while.' : 'This copy of the game has no room server, so playing together is not switched on here. Everything else works on your own.' })], buttons: [{ label: 'OK' }] });

  function refused(why) { shell.toast(WORDS[why] ?? 'That did not work.'); if (!code) ls.del(LAST_KEY); }
  /** Host: a town that goes up to the server. `save` = text, or nothing for a new town. */
  const hostFirst = ({ seed, save = null, lines = [] }) => ({ type: 'host', seed, save, lines, room: `${name() || 'A friend'}'s town`, public: false });

  const self = {
    get state() { return state; }, get room() { return room; }, get code() { return code; }, get base() { return base; }, get on() { return !!room; }, get asked() { return !!asked; },
    get wantedFromUrl() { return params.get('room'); },
    linkFor, hostFirst, isHost,
    /** The room named in the address: ?room=ABCD. On a dev server ?seed= makes it if nobody has. */
    urlFirst() { const c = params.get('room'); return { type: 'join', code: c, ...(params.has('seed') ? { create: { seed: Number(params.get('seed')) } } : null) }; },
    yes() { if (asked) answer(true); },
    /** The title button. */
    async title() {
      const wait = shell.modal({ title: 'Play together', body: [el('p', { text: 'Looking for the room server…' })], buttons: [{ label: 'Never mind', quiet: true }] });
      const found = await ready();
      wait.close();
      if (!found) { noServer(); return; }
      const nameBox = el('input', { class: 'od-name', 'aria-label': 'Your name', maxlength: '24', placeholder: 'Your name', value: name() }), keep = () => { const n = cleanName(nameBox.value); if (n) ls.set(NAME_KEY, n); };
      const last = (() => { try { return JSON.parse(ls.get(LAST_KEY) || 'null'); } catch { return null; } })(), solo = game.soloSave();
      const box = shell.modal({ title: 'Play together', body: [nameBox,
        ...(last ? [row(`Back to ${last.name}`, () => { keep(); box.close(); game.joinRoom(last.code); })] : []),
        ...(solo ? [row(`Bring your town: ${solo.name}, day ${solo.day + 1}`, () => { keep(); box.close(); game.hostSaved(); })] : []),
        row('Start a new town to share', () => { keep(); box.close(); game.pendingHost = true; shell.toast('Pick a household to start with.'); }),
        row('Join with a code', () => { keep(); box.close(); self.codeSheet(); }),
        row('Find a game', () => { keep(); box.close(); self.findSheet(); }),
      ], buttons: [{ label: 'Not now', quiet: true }], onClose: keep });
    },
    /** Letters as buttons: a controller can type too. Keys work; a phone keyboard never covers the town. */
    codeSheet() {
      let typed = '';
      const show = el('b', { class: 'od-code', text: '____' }), grid = el('div', { class: 'od-keys' });
      const add = c => { if (typed.length < 4) typed += c; show.textContent = typed.padEnd(4, '_'); if (typed.length === 4) { box.close(); removeEventListener('keydown', keys, true); game.joinRoom(typed); } };
      for (const c of CODE_LETTERS) grid.append(el('button', { type: 'button', text: c, on: { click: () => add(c) } }));
      grid.append(el('button', { type: 'button', text: '⌫', 'aria-label': 'Rub out', on: { click: () => { typed = typed.slice(0, -1); show.textContent = typed.padEnd(4, '_'); } } }));
      const keys = e => { const c = e.key.toUpperCase(); if (c.length === 1 && CODE_LETTERS.includes(c)) { e.preventDefault(); e.stopPropagation(); add(c); } else if (e.key === 'Backspace') { typed = typed.slice(0, -1); show.textContent = typed.padEnd(4, '_'); } };
      addEventListener('keydown', keys, true);
      const box = shell.modal({ title: 'Join with a code', body: [show, grid], buttons: [{ label: 'Never mind', quiet: true }], onClose: () => removeEventListener('keydown', keys, true) });
      return { add };
    },
    async findSheet() {
      const list = el('div', { class: 'od-list' });
      shell.modal({ title: 'Find a game', body: [list], buttons: [{ label: 'Back', quiet: true }] });
      const rooms = await publicRooms(base);
      if (!rooms.length) list.append(el('p', { class: 'od-tip', text: 'No open towns right now. Start one and set it to Open.' }));
      for (const r of rooms) list.append(row(`${r.name}: ${r.players} here, day ${r.day + 1}`, () => { shell.closeAll(); game.joinRoom(r.code); }));
    },
    /** A room answered. */
    arrived(m) {
      room = m.room; code = m.code ?? code; wasHost = !!m.host; holds = m.holds;
      ls.set(LAST_KEY, JSON.stringify({ code, name: room.name, at: Date.now() }));
      offerBar();
      for (const [id, d] of m.lines ?? []) game.heardLine(id, d);
    },
    back(m) {       // the socket came back
      room = m.room; town.bodies.clear();
      dot('open'); shell.toast('Back in the room.');
      for (const [id, d] of m.lines ?? []) game.heardLine(id, d);
      hands.resume(m.holds);
      offerBar();
    },
    /** A joiner has just arrived and is not anybody yet. */
    who() {
      if (whoShown || hands.on || !room) return;
      whoShown = true;
      const list = el('div', { class: 'od-list' }), mine = (() => { try { return JSON.parse(ls.get(ME_KEY) || 'null'); } catch { return null; } })();
      const box = shell.modal({ title: `${room.name}`, body: [el('p', { class: 'od-tip', text: 'Who will you be?' }), list], buttons: [{ label: 'Just look around', quiet: true }] });
      if (mine) list.append(row(`Bring ${mine.given}`, () => { box.close(); self.bring(mine); }));
      list.append(row('Make someone new', () => { box.close(); bringing = true; game.makePerson(); }));
      const took = can('take'), held = new Set(room.held.map(h => h[0]));
      for (const id of game.freePeople().filter(i => !held.has(i)).slice(0, 6)) list.append(row(`Be ${body(id)}`, () => { box.close(); game.select(id); game.takeOver(id); }, { off: took ? false : 'the host has this off' }));
      list.append(row('Pick anyone in town', () => { box.close(); shell.toast('Tap someone, then Take over.'); }, { quiet: true, off: took ? false : 'the host has this off' }));
    },
    /** Into this town with someone you made. They stay after you go. */
    bring(cmd) { bringing = true; town.cmd({ kind: 'addPerson', ...cmd, household: null }); },
    rememberMe(cmd) { ls.set(ME_KEY, JSON.stringify(cmd)); },
    /** Sim: somebody moved in. If that was you, you are them. */
    personAdded(e) { if (!bringing || e.owner !== town.owner) return false; bringing = false; game.becomeNew(e); return true; },
    /** The town is on screen. A page that was reloaded goes straight back to who it was playing; a newcomer is asked who they will be. */
    afterRoom() { offerBar(); if (holds?.people.length) { hands.resume(holds); holds = null; } if (!isHost() && !hands.on) setTimeout(() => self.who(), 300); },
    message(m) {
      switch (m.type) {
        case 'ready': self.arrived(m); break;
        case 'back': self.back(m); break;
        case 'room': { const had = room; room = m.room; town.setLocalSpeed(room.speed); game.roomSpeed(room.speed); offerBar(); self.draw?.(); if (had) moved(had, room); break; }
        case 'yield': hands.yieldBody(m.who, () => town.post({ type: 'yielded', n: m.n })); self.lastYield = { who: m.who, at: performance.now() }; if (m.who >= 0) shell.toast(`${nameOf(m.to)} took ${body(m.who)} back.`); break;
        case 'said': game.heardLine(m.id, m.d); break;
        case 'note': if (NOTES[m.text]) shell.toast(NOTES[m.text]); break;
        case 'denied': if (m.cmd === 'takeback' || m.cmd === 'give') shell.toast('Only the party leader can do that.'); else if (m.cmd === 'vote') shell.toast(m.why === 'not night' ? 'It is not night.' : 'A vote is already going.'); break;
        case 'refused': dot('off'); refused(m.why); break;
        case 'closed': if (m.why !== 'restart') self.gone(m.why); else shell.toast('The server is restarting. Back in a moment.'); break;
        case 'home': game.homeAgain(m); room = null; code = null; ls.del(LAST_KEY); dot('off'); break;
        default: break;
      }
    },
    /** The room has gone for good, or you were sent out. */
    gone(why) { shell.toast(CLOSED[why] ?? 'The room closed.'); room = null; code = null; if (why !== 'idle') ls.del(LAST_KEY); dot('off'); clearAsk(); game.outOfRoom(); },
    /** You chose to go. */
    leave() { town.post({ type: 'bye' }); link?.stop(); room = null; code = null; dot('off'); clearAsk(); whoShown = false; },
    takeHome() { town.post({ type: 'takeHome' }); },
    /** Speed: in a room nobody sets it alone. */
    askSpeed(x) {
      if (!x) { shell.toast('No pausing with friends here: the town keeps going for everyone.'); return; }
      if (x === 1) { town.post({ type: 'vote', what: 'speed1' }); return; }
      town.post({ type: 'vote', what: x === 2 ? 'speed2' : 'speed4' }); shell.toast('Asked everyone.');
    },
    askNight() { town.post({ type: 'vote', what: 'night' }); shell.toast('Asked everyone.'); },
    /** The room sheet: the same from ☰, the Phone, or the keyboard. */
    sheet() {
      if (!room) return self.solo();
      const body0 = el('div', { class: 'od-list' }), speedOff = room.speed !== 1;
      const box = shell.modal({ title: room.name, body: [body0], buttons: [{ label: 'Done', quiet: true }], onClose: () => { self.draw = null; } });
      self.draw = () => { body0.textContent = ''; fillRoom(body0, box); };
      self.draw();
      void speedOff;
    },
    /** From a game on your own: a town goes up to the server. */
    async solo() {
      const found = await ready();
      if (!found) { noServer(); return; }
      shell.modal({ title: 'Bring a friend', body: [el('p', { text: 'Your town moves to the room server, friends join with a code, and it stays yours: take it home whenever you like.' })], buttons: [{ label: 'Open the town', onClick: () => game.hostLive() }, { label: 'Not now', quiet: true }] });
    },
    /** Rows for the Party list while playing. */
    partyRows() {
      if (!room) return [];
      const out = [], q = partyRow(); if (!q) return out;
      if (isLeader()) for (const id of q.members) { if (id === youId()) continue; const p = room.players.find(x => x.id === id); if (p?.me >= 0) out.push([`Take ${body(p.me)} back from ${p.name}`, () => self.takeback(p.me)]); }
      if (isLeader()) for (const id of q.members) { if (id === youId()) continue; for (const f of hands.party.keys()) { out.push([`Give ${body(f)} to ${nameOf(id)}`, () => town.post({ type: 'give', who: f, to: id })]); break; } }
      if (q.leader !== youId()) out.push([`Follow ${nameOf(q.leader)}: ${hands.followOn ? 'on' : 'off'}`, () => self.follow(!hands.followOn)]);
      return out;
    },
    takeback(who) { town.post({ type: 'takeback', who }); },
    follow(on) { hands.followOn = on; shell.toast(on ? `Following ${nameOf(partyRow()?.leader)}.` : 'On your own feet.'); },
    invite: to => town.post({ type: 'partyInvite', to }), ask: to => town.post({ type: 'partyAsk', to }), splitOff: () => town.post({ type: 'partySplit' }), leaveParty: () => town.post({ type: 'partyLeave' }),
    setPerm: (to, key, on) => town.post({ type: 'perm', to, key, on }),
    /** The body at the front of your party's leader, as your feet need it. */
    leader() {
      const q = partyRow(); if (!q || q.leader === youId()) return null;
      const L = room.players.find(p => p.id === q.leader); if (!L || L.me < 0) return null;
      const row0 = town.mirror.people.get(L.me), track = town.bodies.get(L.me), carId = row0?.hold?.car ?? -1, c = carId >= 0 ? cars.byLive.get(carId) : null;
      if (c?.fixed) return { x: c.fixed.x, z: c.fixed.z, lv: 0, car: carId };
      const at = track?.read(town.serverNow(), {}) ?? (row0?.x != null ? { x: row0.x, z: row0.z, lv: row0.hold?.lv ?? 0 } : null);
      return at ? { x: at.x, z: at.z, lv: at.lv, car: null } : null;
    },
    /** Cars of the people in your party, for getting in. */
    crewCars() { const q = partyRow(); if (!q) return []; return town.mirror.live.filter(r => r[8] !== youId() && q.members.includes(r[8])).map(r => ({ id: r[0], owner: r[8] })); },
    /** Once a frame. */
    frame(dt) {
      if (!room) { if (tagBox) { for (const t of tags.values()) t.hidden = true; } return; }
      backupClock += dt;
      if (backupClock > BACKUP_SECONDS && isHost()) { backupClock = 0; self.backup(); }
      drawTags();
      if (sampling) sample();
    },
    async backup() { try { const m = await town.saveText(); const gz = await gzipText(m.text); let s = ''; for (let i = 0; i < gz.length; i += 0x8000) s += String.fromCharCode.apply(null, gz.subarray(i, i + 0x8000)); ls.set(BACKUP_KEY, JSON.stringify({ code, at: Date.now(), household: game.household?.id ?? 0, b64: btoa(s) })); } catch (e) { console.warn('[oddhaven] backup', e); } },
    readBackup() { try { return JSON.parse(ls.get(BACKUP_KEY) || 'null'); } catch { return null; } },
    mount(corner) { netDot = el('i', { class: 'od-netdot', 'aria-hidden': 'true' }); netDot.dataset.on = 'off'; corner.append(netDot); tagBox = el('div', { class: 'od-tags' }); parent.append(tagBox); },
    /** Numbers for gameEye. */
    stateOf: () => ({ on: !!room, state, code, you: youId(), host: isHost(), leader: isLeader(), party: partyRow(), room, asked: !!asked, bytes: link?.bytes ?? null, rtt: link?.clock.rtt ?? null, invite: code ? inviteUrl() : null, base }),
    cut() { link?.cut(); },
    /** Tests: the picture of one car, frame by frame. */
    sampleCar(liveId) { sampling = liveId == null ? null : { id: liveId, rows: [] }; },
    samples: () => sampling?.rows ?? [],
  };
  function sample() {
    const c = cars.byLive.get(sampling.id); if (!c?.fixed) return;
    if (sampling.rows.length < 4000) sampling.rows.push([performance.now(), c.fixed.x, c.fixed.z, c.remote ? 1 : 0, hands.car?.id === sampling.id ? 1 : 0]);
  }
  function moved(was, now) {
    for (const p of now.players) { const old = was.players.find(q => q.id === p.id); if (!old && p.id !== youId()) shell.toast(`${p.name} is here.`); else if (old?.online && !p.online && p.id !== youId()) shell.toast(`${p.name} dropped out.`); else if (old && !old.online && p.online && p.id !== youId()) shell.toast(`${p.name} is back.`); }
    const a = was.parties.find(q => q.members.includes(youId())), b = now.parties.find(q => q.members.includes(youId()));
    if (a && b && a.id !== b.id && b.members.length > 1) shell.toast(`You are in ${nameOf(b.leader)}'s party.`);
    if (a && b && a.members.length > 1 && b.members.length === 1 && a.id !== b.id) { hands.followOn = false; shell.toast('You are on your own now, in a party of your own.'); }
  }
  function lost() {
    if (!room) { return; }
    const back = self.readBackup(), mine = wasHost && back && back.code === code;
    room = null; dot('off'); clearAsk();
    shell.modal({ title: 'The room has gone', body: [el('p', { text: mine ? `The room server is not answering. Your last copy of the town is from ${Math.max(1, Math.round((Date.now() - back.at) / 60000))} min ago.` : 'The room server is not answering. Your own saved game is safe.' })],
      buttons: [...(mine ? [{ label: 'Keep playing on my own', onClick: () => game.fromBackup(back) }] : []), { label: 'Title screen', quiet: !!mine, onClick: () => game.outOfRoom() }] });
  }
  function fillRoom(box0, box) {
    const r = room, code0 = el('b', { class: 'od-code', text: code ?? '' });
    box0.append(code0);
    const qr = el('div', { class: 'od-qr' }), inv = el('small', { class: 'od-link2', text: inviteUrl() });
    qrSvg(inviteUrl()).then(svg => { qr.innerHTML = svg; }).catch(() => {});
    box0.append(qr, inv, row('Copy the link', async () => { try { await navigator.clipboard.writeText(inviteUrl()); shell.toast('Copied.'); } catch { shell.toast(inviteUrl()); } }));
    box0.append(el('h4', { text: 'Players' }));
    for (const p of r.players) box0.append(row(`${p.name}${p.id === r.host ? ' (host)' : ''}${p.id === youId() ? ' (you)' : ''}${p.online ? '' : ' (away)'}${p.me >= 0 ? `: ${body(p.me)}` : ''}`, () => { box.close(); self.playerSheet(p.id); }, { quiet: true }));
    const q = partyRow();
    box0.append(el('h4', { text: q?.members.length > 1 ? `${nameOf(q.leader)}'s party` : 'Your party: just you' }));
    if (q?.members.length > 1) {
      if (q.leader !== youId()) box0.append(row(`Follow ${nameOf(q.leader)}: ${hands.followOn ? 'on' : 'off'}`, () => { self.follow(!hands.followOn); self.draw?.(); }));
      box0.append(row('Split off, keep who you are playing', () => self.splitOff()), row('Leave the party', () => self.leaveParty(), { quiet: true }));
    }
    if (can('settings')) box0.append(seg('Who can join', [[false, 'Code only'], [true, 'Open']], r.public, v => town.post({ type: 'setRoom', public: v })));
    box0.append(el('h4', { text: r.speed > 1 ? `Running at ${r.speed}x` : 'The clock' }));
    if (r.speed > 1) box0.append(row('Back to 1x', () => self.askSpeed(1)));
    else {
      const m = town.mirror.minute, night = m >= 1260 || m < 300;
      box0.append(row('Ask to run at 2x', () => self.askSpeed(2), { off: r.vote ? 'a vote is on' : false }), row('Ask to skip the night', () => self.askNight(), { off: night ? (r.vote ? 'a vote is on' : false) : 'it is not night' }));
    }
    box0.append(el('p', { class: 'od-tip', text: state === 'open' ? `Connected${link?.clock.rtt ? `, ${Math.round(link.clock.rtt)} ms` : ''}.` : 'Reconnecting…' }));
    if (r.owner === youId()) box0.append(row('Take the town home', () => { box.close(); self.takeHome(); }));
    box0.append(row(r.owner === youId() ? 'Leave it running and go' : 'Leave the room', () => { box.close(); self.leave(); game.outOfRoom(); }, { quiet: true }));
  }
  const seg = (label, options, value, set) => { const b = el('div', { class: 'od-seg' }); for (const [v, text] of options) b.append(el('button', { type: 'button', class: v === value ? 'on' : '', text, on: { click: e => { for (const x of b.children) x.classList.remove('on'); e.currentTarget.classList.add('on'); set(v); } } })); return el('div', { class: 'od-row' }, el('span', { text: label }), b); };
  self.playerSheet = id => {
    const p = room.players.find(x => x.id === id), mine = id === youId(), q = partyRow(), inMine = q?.members.includes(id), body0 = [];
    if (!p) return;
    if (!mine && !inMine) { if (partyRow()?.leader === youId()) body0.push(row(`Invite ${p.name} to your party`, () => { box.close(); self.invite(id); shell.toast('Asked.'); })); body0.push(row(`Ask to join ${p.name}'s party`, () => { box.close(); self.ask(id); shell.toast('Asked.'); }, { quiet: true })); }
    if (isLeader() && inMine && !mine && p.me >= 0) body0.push(row(`Take ${body(p.me)} back`, () => { box.close(); self.takeback(p.me); }));
    if (isHost() && !mine && id !== room.owner) {
      body0.push(el('h4', { text: `What ${p.name} may do` }));
      for (const [k, label] of PERM_ROWS) body0.push(seg(label, [[true, 'Yes'], [false, 'No']], !!p.perms[k], v => self.setPerm(id, k, v)));
      body0.push(row(`Remove ${p.name}`, () => { box.close(); town.post({ type: 'kick', to: id }); }, { quiet: true }));
    } else if (mine) body0.push(el('p', { class: 'od-tip', text: `You may: ${PERM_ROWS.filter(([k]) => can(k)).map(([, l]) => l.toLowerCase()).join(', ') || 'look around'}.` }));
    const box = shell.modal({ title: p.name, body: body0, buttons: [{ label: 'Back', quiet: true, onClick: () => self.sheet() }] });
  };
  function drawTags() {
    if (!tagBox) return;
    const seen = new Set();
    for (const p of room.players) {
      if (p.id === youId() || p.me < 0) continue;
      const q = people.spots.get(p.me), s = q && !q.hidden ? project(q.x, q.y + 2.6, q.z) : null;
      if (!s) continue;
      seen.add(p.id);
      let t = tags.get(p.id);
      if (!t) { t = el('span', { class: 'od-tag' }); tags.set(p.id, t); tagBox.append(t); }
      if (t.textContent !== p.name) t.textContent = p.name;
      t.hidden = false; t.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
    }
    for (const [id, t] of tags) if (!seen.has(id)) t.hidden = true;
  }
  void premades;
  return self;
}
