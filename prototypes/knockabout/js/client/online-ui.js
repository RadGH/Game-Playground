// Online play's screens, plugged into main.js through one call (installOnline) so couch play stays exactly as it was:
//   title     "Host online" / "Join with code" / "Find a game" — shown only when a Knockabout server answers
//             (net.js serverAvailable), so GitHub Pages and the bare test servers never show a button that cannot work
//   room      the online lobby: the room code, the invite link + QR, every device's players (each device may bring
//             several: press any button on a pad / keyboard half to join, a phone joins with its touch screen), CPU
//             players, and the host's game settings (mode, arena, rounds, difficulty, teams, listed publicly)
//   match     main.js's own match screen, fed by js/client/online.js instead of local.js
//   results   main.js's own results screen; the rating goes to the room (the server's insights log), not the tally
//   vote      room-wide: every player in the room votes with their own controller, everyone sees the tally, the
//             server picks (ties at random) and starts the next match for everybody
// A phone that opens an invite link (?code=ABCD) joins at once and, being a touch screen, as one touch player.
import { connect, serverAvailable } from './net.js';
import { createOnlineSession } from './online.js';
import { MAX_LOCAL, cleanCode } from '../net/protocol.js';
import { qrSvg, joinUrl } from '../../../tumblefair/js/client/qr.js';

export function installOnline(ctx) {
  const { S, view, nav, sounds, input, screenEl, esc, cap, portrait, COLORS, TEAMS, MAX, arenaById, modeById, openLook, showTitle, startMatch, isTouch, deviceName, buttonsFor, loadSlot, saveSlot, randomLook, NAMES } = ctx;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('../../css/online.css', import.meta.url).href; document.head.append(css);
  let net = null, locals = [], note = '', qrFor = null, qrHtml = '', listTimer = 0;
  const O = { net: null, get room() { return net?.room || null; }, get code() { return net?.room?.code || null; }, get isHost() { return !!net?.room && net.room.host === net.room.you; } };
  S.online = null;

  // ---------------------------------------------------------------- connecting
  function ensureNet() {
    if (net) return net;
    net = connect(); O.net = net; S.online = O;
    net.on('room', onRoom);
    net.on('start', onStart);
    net.on('lobby', () => { if (S.screen !== 'room' && S.screen !== 'builder') { ctx.stopMatch(); enterRoom(); } });
    net.on('votes', m => { if (net.room?.results) net.room.results.votes = m.votes; if (S.screen === 'vote' && voteView) voteView.draw(); });
    net.on('over', m => { O.lastOver = m; if (m.resume && S.screen !== 'results' && S.screen !== 'vote') { S.last = { result: m.result, arena: arenaById(m.arena), mode: m.mode }; ctx.showResults(); } });
    net.on('err', m => { note = m.msg || 'Something went wrong.'; if (m.code === 'noroom' || m.code === 'version') { leave(false); showMessage(m.msg); return; } if (S.screen === 'room') draw(); else ctx.hud.toast?.(esc(note), '#ff5f6d'); });
    net.on('note', m => { note = m.msg; if (S.screen === 'room') draw(); });
    net.on('status', s => { document.body.dataset.net = s; if (S.screen === 'room') draw(); });
    return net;
  }
  function leave(toTitle = true) {
    if (net) { try { net.leave(); } catch { /* closed */ } net.close(); }
    net = null; O.net = null; S.online = null; locals = []; S.players = []; note = ''; qrFor = null;
    document.body.dataset.net = '';
    try { sessionStorage.removeItem('knockabout.locals'); } catch { /* storage blocked */ }
    ctx.stopMatch(); voteView = null; S.voteTick = null;
    if (toTitle) showTitle();
  }
  function host() { ensureNet(); const go = () => net.create({ public: false }); net.status === 'online' ? go() : net.on('welcome', function w() { net.off('welcome', w); go(); }); waitScreen('Making a room…'); }
  function join(code) {
    const c = cleanCode(code); if (!c) return false;
    ensureNet(); const go = () => net.join(c); net.status === 'online' ? go() : net.on('welcome', function w() { net.off('welcome', w); go(); });
    waitScreen(`Joining room ${c}…`);
    return true;
  }
  function waitScreen(text) { ctx.go('room-wait'); screenEl.onclick = null; screenEl.innerHTML = `<div class="loading">${esc(text)}<br><button class="btn" data-x>Cancel</button></div>`; screenEl.querySelector('[data-x]').onclick = () => leave(); }
  function showMessage(text) {
    const el = document.createElement('div'); el.className = 'modal';
    el.innerHTML = `<div class="panel"><h2>Online</h2><p>${esc(text)}</p><div class="row end"><button class="btn primary" data-back data-autofocus>OK</button></div></div>`;
    document.body.append(el); const prev = nav.root; S.modal = el;
    const close = () => { el.remove(); S.modal = null; nav.attach(prev, { keep: false }); };
    el.querySelector('[data-back]').onclick = close; nav.attach(el.querySelector('.panel'), { keep: false });
  }

  // ---------------------------------------------------------------- this device's players
  const mine = () => locals.slice();
  function addLocal(dev) {
    if (locals.some(l => l.dev === dev) || locals.length >= MAX_LOCAL) return null;
    const room = net?.room; if (room && room.players.length >= MAX) { note = `This room is full (${MAX} fighters).`; draw(); return null; }
    let local = 0; while (locals.some(l => l.local === local)) local++;
    const saved = loadSlot(local);
    const look = saved?.look || randomLook();
    const l = { local, dev, name: saved?.name || NAMES[(local * 3 + 1) % NAMES.length], look };
    if (!saved) saveSlot(local, { look, name: l.name });
    locals.push(l); sounds('join'); pushLocals();
    return l;
  }
  function removeLocal(local) { locals = locals.filter(l => l.local !== local); sounds('back'); pushLocals(); }
  function pushLocals() {
    net?.send({ t: 'locals', list: locals.map(l => ({ local: l.local, name: l.name, look: l.look })) });
    try { sessionStorage.setItem('knockabout.locals', JSON.stringify({ code: net?.room?.code || net?.code, list: locals.map(l => ({ local: l.local, dev: l.dev })) })); } catch { /* storage blocked */ }
  }
  /** After a page reload in the same room: the same controllers drive the same players again (this tab only). */
  function restoreLocals(code) {
    if (locals.length) return;
    let saved = null; try { saved = JSON.parse(sessionStorage.getItem('knockabout.locals') || 'null'); } catch { /* none */ }
    if (!saved || saved.code !== code || !Array.isArray(saved.list)) return;
    for (const { local, dev } of saved.list.slice(0, MAX_LOCAL)) {
      if (!Number.isInteger(local) || typeof dev !== 'string' || locals.some(l => l.local === local || l.dev === dev)) continue;
      const sv = loadSlot(local); locals.push({ local, dev, name: sv?.name || 'Player', look: sv?.look || randomLook() });
    }
    if (locals.length) pushLocals();
  }
  /** The builder changed one of this device's players. */
  O.lookChanged = p => { const l = locals.find(x => x.local === p.local && p.mine); if (!l) return; l.look = p.look; l.name = p.name; pushLocals(); };

  /** The room's players as main.js's S.players (seat = slot, so the seat colours match on every screen). */
  function mirrorPlayers() {
    const room = net?.room; if (!room) return;
    S.players = room.players.map(rp => {
      const isMine = rp.dev === room.you && !rp.cpu, l = isMine ? locals.find(x => x.local === rp.local) : null;
      return { slot: rp.seat, pid: rp.pid, dev: l ? l.dev : null, cpu: rp.cpu, level: rp.level || 'normal', ready: rp.ready, look: l ? l.look : rp.look || { race: 'human', seed: rp.pid }, color: COLORS[rp.seat].color, colorName: COLORS[rp.seat].name,
        team: rp.team, name: rp.name || l?.name || 'Player', mine: isMine, remote: !isMine && !rp.cpu, local: rp.local, on: rp.on, waiting: rp.waiting, saveSlot: isMine ? rp.local : undefined };
    });
    const st = room.opts; S.settings.mode = st.mode; S.settings.arena = st.arena; S.settings.rounds = st.rounds; S.settings.difficulty = st.difficulty;
  }
  function onRoom(m) {
    restoreLocals(m.code);
    mirrorPlayers();
    if (S.screen === 'room-wait') enterRoom();
    else if (S.screen === 'room') draw();
    else if (S.screen === 'vote' && voteView) voteView.draw();
  }
  function enterRoom() {
    S.voteTick = null; voteView = null;
    view.setArena(null); view.clearFighters(); view.frameAll = false; view.lookAt([0, 3, 12], [0, 1, 0], { instant: true });
    ctx.go('room');
    // a phone that came in by link plays with its own screen
    if (isTouch() && !locals.some(l => l.dev === 'touch') && (S.autoTouch || !locals.length)) { S.autoTouch = false; addLocal('touch'); }
    draw();
  }

  // ---------------------------------------------------------------- the match
  function onStart(m) {
    const room = net.room;
    const localPids = new Map();
    for (const rp of room?.players || []) if (rp.dev === room.you && !rp.cpu) localPids.set(rp.pid, rp.local);
    mirrorPlayers();
    S.settings.mode = m.mode; S.settings.rounds = m.rounds; S.settings.difficulty = m.difficulty;
    // the fighters' looks as the match has them (a player who left since keeps their look in this match)
    for (const mp of m.players) if (!S.players.some(p => p.pid === mp.pid)) S.players.push({ slot: mp.pid - 1, pid: mp.pid, cpu: mp.cpu, look: mp.look || { race: mp.look?.race, seed: mp.pid }, name: mp.name, color: COLORS[(mp.pid - 1) % 8].color, team: mp.team, remote: true, gone: true });
    for (const p of S.players) { const mp = m.players.find(x => x.pid === p.pid); if (mp && S.settings.mode === 'teams') p.team = mp.team; }
    if (S.builder) S.builder.close?.();
    for (const el of document.querySelectorAll('.modal.ka-online')) el.remove();
    voteView = null; S.voteTick = null;
    const sess = createOnlineSession(net, m, { localPids });
    startMatch(m.arena, sess);
  }
  O.rate = (v, why) => net?.send({ t: 'rate', v: v > 0 ? 1 : -1, why });
  O.end = () => net?.send({ t: 'end' });
  O.leave = () => leave(true);

  // ---------------------------------------------------------------- the room screen
  async function qrOf(code) {
    if (qrFor === code) return qrHtml;
    qrFor = code; qrHtml = '';
    try { qrHtml = await qrSvg(joinUrl(code)); } catch { qrHtml = ''; }
    if (S.screen === 'room') draw();
    return qrHtml;
  }
  function draw() {
    const room = net?.room; if (!room || S.screen !== 'room' || S.builder) return;
    mirrorPlayers();
    const amHost = O.isHost, st = room.opts, mode = modeById(st.mode), n = room.players.length;
    if (qrFor !== room.code) qrOf(room.code);
    const minP = mode.minPlayers ?? (mode.id === 'waves' ? 1 : 2);
    const teamsOk = st.mode !== 'teams' || new Set(room.players.map(p => p.team)).size >= 2;
    const ok = n >= minP && teamsOk && S.players.some(p => !p.cpu && p.on);
    const cards = [];
    for (let i = 0; i < MAX; i++) {
      const p = S.players.find(x => x.slot === i);
      if (!p) {
        cards.push(`<div class="card empty" style="--seat:${COLORS[i].color}"><div class="join-hint">Press any button<br>to join</div><div class="card-btns">${isTouch() && !locals.some(l => l.dev === 'touch') ? `<button class="btn small primary" data-touchjoin>Tap to join</button>` : ''}${amHost ? `<button class="btn small" data-addcpu>+ CPU</button>` : ''}</div></div>`);
        continue;
      }
      const B = p.mine ? buttonsFor(p.dev) : null;
      const who = p.cpu ? 'CPU · ' + cap(p.level) : p.mine ? esc(deviceName(p.dev || '')) + ' · you' : p.on ? 'Online' : 'Reconnecting…';
      const state = p.cpu ? '' : p.waiting ? 'Joins next match' : p.ready ? 'Ready!' : p.mine ? (p.dev === 'touch' ? 'Tap Ready when set' : `Press <kbd>${B.a}</kbd> when ready`) : 'Getting ready…';
      const btns = p.cpu ? (amHost ? `<button class="btn small" data-level="${p.pid}">Level</button><button class="btn small" data-rmcpu="${p.pid}">Remove</button>` : '')
        : p.mine ? `<button class="btn small${p.ready ? '' : ' primary'}" data-ready="${p.local}">${p.ready ? 'Not ready' : 'Ready'}</button><button class="btn small" data-look="${p.pid}">Look</button><button class="btn small" data-rmlocal="${p.local}">Leave</button>` : '';
      cards.push(`<div class="card${p.ready ? ' ready' : ''}${p.cpu ? ' cpu' : ''}${p.mine ? ' mine' : ''}${!p.cpu && !p.on ? ' away' : ''}" style="--seat:${p.color}"><div class="card-top"><b class="pname">${esc(p.name)}</b><span class="dev">${who}</span></div><img class="face" src="${portrait(p.look)}" alt=""><div class="state">${state}</div><div class="card-btns">${btns}</div></div>`);
    }
    const arena = st.arena === '*' ? null : arenaById(st.arena);
    const pill = (key, val, label, on) => amHost ? `<button class="pill${on ? ' on' : ''}" data-opt="${key}" data-val="${esc(String(val))}">${label}</button>` : (on ? `<span class="pill on ro">${label}</span>` : '');
    const link = joinUrl(room.code);
    screenEl.innerHTML = `<div class="room-wrap">
      <div class="bar"><button class="btn" data-leave>‹ Leave</button><h2>Room <span class="code">${esc(room.code)}</span>${net.status !== 'online' ? ' <i class="net-badge">reconnecting…</i>' : ''}</h2>${amHost ? `<button class="btn primary big" data-fight ${ok ? '' : 'disabled'} data-autofocus>Fight!</button>` : `<span class="wait-host">The host starts the match</span>`}</div>
      ${note ? `<p class="warn">${esc(note)}</p>` : ''}
      <div class="room-top">
        <div class="panel invite"><div class="qr">${qrHtml || ''}</div><div class="inv-text"><b>Join on a phone or another computer</b><span>Scan the code, or open<br><a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a><br>and enter <b class="code">${esc(room.code)}</b></span>
          <div class="row"><button class="btn small" data-copy>Copy link</button>${amHost ? `<label class="check"><input type="checkbox" data-public ${st.public ? 'checked' : ''}> Listed in “Find a game”</label>` : st.public ? '<span class="note">Listed in “Find a game”</span>' : ''}</div></div></div>
        <div class="panel how-online"><b>${amHost ? 'You are the host' : 'Waiting for the host'}</b><span>Every controller and each half of the keyboard on any device is its own player — press a button to join. Up to ${MAX} fighters, CPUs included.</span></div>
      </div>
      <div class="cards">${cards.join('')}</div>
      <div class="sec"><h3>Mode</h3><div class="modes">${S.modes.map(m => amHost ? `<button class="mode${m.id === st.mode ? ' on' : ''}" data-opt="mode" data-val="${m.id}"><b>${esc(m.name)}</b><span>${esc(m.blurb || '')}</span></button>` : m.id === st.mode ? `<div class="mode on ro"><b>${esc(m.name)}</b><span>${esc(m.blurb || '')}</span></div>` : '').join('')}</div></div>
      <div class="sec"><h3>Arena</h3><div class="arenas${amHost ? '' : ' ro'}">${amHost ? S.arenas.map(a => `<button class="arena${a.id === st.arena ? ' on' : ''}" data-opt="arena" data-val="${a.id}"><img src="${view.arenaPicture(a)}" alt=""><b>${esc(a.name)}</b></button>`).join('') + `<button class="arena random${st.arena === '*' ? ' on' : ''}" data-opt="arena" data-val="*"><span class="dice">?</span><b>Surprise me</b></button>`
        : arena ? `<div class="arena on"><img src="${view.arenaPicture(arena)}" alt=""><b>${esc(arena.name)}</b></div>` : `<div class="arena random on"><span class="dice">?</span><b>Surprise me</b></div>`}</div>
        <p class="arena-about">${arena ? `<b>${esc(arena.name)}</b> — ${esc(arena.blurb || '')} <i>${esc(arena.trick || '')}</i>` : 'A different arena each match.'}</p></div>
      <div class="sec opts">
        ${st.mode === 'waves' ? '' : `<div class="opt"><h3>Rounds to win</h3><div class="pills">${[1, 2, 3, 5].map(r => pill('rounds', r, r, st.rounds === r)).join('')}</div></div>`}
        <div class="opt"><h3>${st.mode === 'waves' ? 'Goons' : 'CPU players'}</h3><div class="pills">${['easy', 'normal', 'hard'].map(d => pill('difficulty', d, cap(d), st.difficulty === d)).join('')}</div></div>
      </div>
      ${st.mode === 'teams' ? `<div class="sec"><h3>Teams <span class="note">(${amHost ? 'press a player to switch team' : 'press yourself to switch team'})</span></h3><div class="teams">${S.players.map(p => `<button class="tchip" style="--seat:${TEAMS[p.team % 4].color}" data-team="${p.pid}" ${amHost || p.mine ? '' : 'disabled'}><img src="${portrait(p.look)}" alt=""><span>${esc(p.name)}</span><i>${TEAMS[p.team % 4].name}</i></button>`).join('')}</div></div>` : ''}
    </div>`;
    screenEl.onclick = onRoomClick;
    const pub = screenEl.querySelector('[data-public]'); if (pub) pub.onchange = () => net.send({ t: 'opt', key: 'public', value: pub.checked });
    nav.attach(screenEl);
  }
  function onRoomClick(e) {
    const t = e.target; if (S.screen !== 'room') return;
    const num = k => +t.closest(`[${k}]`).getAttribute(k);
    if (t.closest('[data-leave]')) return leave(true);
    if (t.closest('[data-fight]')) { note = ''; return net.send({ t: 'start' }); }
    if (t.closest('[data-copy]')) { navigator.clipboard?.writeText(joinUrl(net.room.code)).then(() => { note = 'Link copied.'; draw(); }, () => {}); return; }
    if (t.closest('[data-touchjoin]')) { addLocal('touch'); return; }
    if (t.closest('[data-addcpu]')) return net.send({ t: 'cpu', add: true });
    if (t.closest('[data-rmcpu]')) return net.send({ t: 'cpu', pid: num('data-rmcpu'), add: false });
    if (t.closest('[data-level]')) { const p = S.players.find(x => x.pid === num('data-level')), L = ['easy', 'normal', 'hard']; return net.send({ t: 'cpu', pid: p.pid, level: L[(L.indexOf(p.level) + 1) % 3] }); }
    if (t.closest('[data-ready]')) { const local = num('data-ready'), p = S.players.find(x => x.mine && x.local === local); sounds('ready'); return net.send({ t: 'ready', local, on: !p?.ready }); }
    if (t.closest('[data-rmlocal]')) return removeLocal(num('data-rmlocal'));
    if (t.closest('[data-look]')) { const p = S.players.find(x => x.pid === num('data-look')); if (p) openLook(p); return; }
    if (t.closest('[data-team]')) return net.send({ t: 'team', pid: num('data-team') });
    const o = t.closest('[data-opt]');
    if (o) { const key = o.dataset.opt, raw = o.dataset.val; return net.send({ t: 'opt', key, value: key === 'rounds' ? +raw : raw }); }
  }
  /** Every frame on the room screen: devices that press something join; their own buttons ready / look / leave. */
  function roomTick() {
    if (S.builder || !net?.room) return;
    for (const dev of input.devices()) {
      const e = input.edges(dev), l = locals.find(x => x.dev === dev);
      if (!l) {
        if (dev === 'touch' || e.b) continue;
        if (e.start && O.isHost && locals.length) { net.send({ t: 'start' }); continue; }
        addLocal(dev); continue;
      }
      const p = S.players.find(x => x.mine && x.local === l.local);
      if (e.a) { sounds('ready'); net.send({ t: 'ready', local: l.local, on: !p?.ready }); }
      else if (e.y && p) return openLook(p);
      else if (e.b) { if (p?.ready) net.send({ t: 'ready', local: l.local, on: false }); else removeLocal(l.local); }
      else if (e.start && O.isHost) net.send({ t: 'start' });
      else if (e.x && O.isHost) net.send({ t: 'cpu', add: true });
    }
  }

  // ---------------------------------------------------------------- vote (room-wide)
  let voteView = null;
  O.showVote = () => {
    const room = net?.room; const R = room?.results;
    if (!R) { ctx.go('vote'); screenEl.innerHTML = `<div class="loading">Waiting for the next match…</div>`; return; }
    ctx.go('vote');
    const choices = R.choices.map(id => arenaById(id));
    const myVoters = S.players.filter(p => p.mine);
    const pick = new Map(myVoters.map((p, i) => [p.pid, R.votes?.[p.pid] ?? i % choices.length]));
    const endsAt = performance.now() + (R.endsIn ?? 30000);
    const draw2 = () => {
      const votes = net.room?.results?.votes || {};
      const everyone = S.players.filter(p => !p.cpu && !p.gone);
      const dotsFor = i => everyone.map(p => {
        const voted = votes[p.pid] != null, at = voted ? votes[p.pid] : p.mine ? pick.get(p.pid) : null;
        return at === i ? `<span class="vdot${voted ? ' locked' : ''}" style="--seat:${p.color}" title="${esc(p.name)}">${esc(p.name.slice(0, 1))}</span>` : '';
      }).join('');
      const count = i => Object.values(votes).filter(v => v === i).length;
      screenEl.innerHTML = `<div class="vote-wrap"><h2 class="shout">Vote for the next arena</h2>
        <p class="note center">Everyone in the room votes. ${myVoters.some(p => p.dev && p.dev !== 'touch') ? 'Left / right to choose, A to lock in. ' : ''}Tap a card to vote. <span class="timer"></span></p>
        <div class="vchoices">${choices.map((a, i) => `<button class="vcard" data-choice="${i}"><img src="${view.arenaPicture(a)}" alt=""><b>${esc(a.name)}${a.id === R.choices[R.choices.length - 1] ? ' <i>(again)</i>' : ''} <span class="vcount">${count(i) || ''}</span></b><div class="voters">${dotsFor(i)}</div></button>`).join('')}</div>
        <div class="row end"><button class="btn" data-back>Back</button>${O.isHost ? '<button class="btn primary big" data-go>Go!</button>' : ''}</div></div>`;
      nav.attach(screenEl);
    };
    const vote = (p, i) => { pick.set(p.pid, i); net.send({ t: 'vote', local: p.local, i }); sounds('ready'); };
    screenEl.onclick = e => {
      const c = e.target.closest('[data-choice]');
      if (c) { const votes = net.room?.results?.votes || {}; const p = myVoters.find(x => votes[x.pid] == null) || myVoters[0]; if (p) vote(p, +c.dataset.choice); return; }
      if (e.target.closest('[data-go]')) return net.send({ t: 'go' });
      if (e.target.closest('[data-back]')) { S.voteTick = null; voteView = null; return ctx.showResults(); }
    };
    S.voteTick = () => {
      for (const p of myVoters) {
        if (!p.dev || p.dev === 'touch') continue;
        const e = input.edges(p.dev), voted = net.room?.results?.votes?.[p.pid] != null;
        if (!voted && (e.left || e.right)) { pick.set(p.pid, (pick.get(p.pid) + (e.right ? 1 : -1) + choices.length) % choices.length); sounds('move'); draw2(); }
        if (e.a && !voted) vote(p, pick.get(p.pid));
      }
      const left = Math.max(0, Math.ceil((endsAt - performance.now()) / 1000));
      const tm = screenEl.querySelector('.timer'); if (tm) tm.textContent = `${left}s`;
    };
    voteView = { draw: draw2 };
    draw2();
  };

  // ---------------------------------------------------------------- title: join by code / find a game
  O.decorateTitle = async el => {
    if (!(await serverAvailable()) || S.screen !== 'title') return;
    const box = el.querySelector('.title-btns'); if (!box || box.querySelector('[data-host]')) return;
    const row = document.createElement('div'); row.className = 'online-btns';
    row.innerHTML = `<button class="btn" data-host>Host online</button><button class="btn" data-joincode>Join with code</button><button class="btn" data-find>Find a game</button>`;
    box.after(row);
    row.querySelector('[data-host]').onclick = () => host();
    row.querySelector('[data-joincode]').onclick = () => askCode();
    row.querySelector('[data-find]').onclick = () => findGame();
    nav.attach(el, { keep: true });
  };
  function modal(html) {
    const el = document.createElement('div'); el.className = 'modal ka-online'; el.innerHTML = `<div class="panel">${html}</div>`;
    document.body.append(el); const prev = nav.root; S.modal = el;
    const close = () => { el.remove(); if (S.modal === el) S.modal = null; clearInterval(listTimer); nav.attach(prev, { keep: false }); };
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-x]')) close(); });
    nav.attach(el.querySelector('.panel'), { keep: false });
    return { el, close };
  }
  function askCode() {
    const { el, close } = modal(`<h2>Join with code</h2><p>Type the four letters shown on the host's screen.</p>
      <input class="code-in" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD">
      <p class="err"></p><div class="row end"><button class="btn" data-x data-back>Cancel</button><button class="btn primary big" data-go>Join</button></div>`);
    const inp = el.querySelector('.code-in'); setTimeout(() => inp.focus(), 30);
    const go = () => { if (join(inp.value)) close(); else el.querySelector('.err').textContent = 'That is four letters, like ABCD.'; };
    el.querySelector('[data-go]').onclick = go;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  }
  function findGame() {
    ensureNet();
    const { el, close } = modal(`<h2>Find a game</h2><div class="rooms"><p class="note">Looking…</p></div><div class="row end"><button class="btn" data-x data-back>Close</button></div>`);
    const ask = () => net?.send({ t: 'rooms' });
    const onList = m => {
      const box = el.querySelector('.rooms'); if (!box) return;
      box.innerHTML = m.list.length ? m.list.map(r => `<button class="room-row" data-code="${esc(r.code)}"><b class="code">${esc(r.code)}</b><span>${esc(r.hostName ? r.hostName + "'s room" : 'A room')} · ${esc(modeById(r.mode)?.name || r.mode)} · ${esc(r.arena === '*' ? 'Surprise arenas' : arenaById(r.arena)?.name || '')}</span><i>${r.players}/${r.seats}${r.phase === 'match' ? ' · fighting' : ''}</i></button>`).join('')
        : `<p class="note">No public games right now. Host one and tick “Listed in Find a game”, or ask a friend for their code.</p>`;
      box.onclick = e => { const b = e.target.closest('[data-code]'); if (b) { net.off('rooms', onList); close(); join(b.dataset.code); } };
      nav.attach(el.querySelector('.panel'));
    };
    net.on('rooms', onList);
    if (net.status === 'online') ask(); else net.on('welcome', function w() { net.off('welcome', w); ask(); });
    listTimer = setInterval(ask, 3000);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-x]')) { net?.off('rooms', onList); if (!S.online?.room) leave(false); } });
  }

  O.joinCode = code => { S.autoTouch = true; return join(code); };
  O.tick = () => { if (S.screen === 'room') roomTick(); };
  O.draw = draw;
  O.enterRoom = enterRoom;
  O.mine = mine;
  return O;
}
