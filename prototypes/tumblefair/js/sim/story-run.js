// Story Night (Expansion 1, M8): a story on the room's clock. js/sim/story.js is the grammar (pure, no time); this file
// shows its cards one at a time (phase 'story'), runs the choice timer, takes taps and votes, plays for the CPUs and for
// a phone that has gone away, picks each encounter's minigame from the room's own list and hands it to the room, and
// at the end shows the epilogue card and asks the room to finish. room.js only has a few one-line hooks into it.
//
// Card messages: phase 'story' with { card, votes, ready } (the room keeps the last phase message, so a phone that
// comes back mid-card is shown it with the time left). Votes and "next" taps go out as { t: 'sv', votes, ready }.
// Phones answer with the messages they already have: { t: 'vote', i } picks, { t: 'skip' } = Next.
import { createStory, STORY } from './story.js';
import { GAMES } from '../games/index.js';
import { hasKind } from '../games/tags.js';
import { roundParts, PACE } from './match-time.js';

export const STORY_TIMES = Object.freeze({
  /** A choice card: the leader (or everyone, in a vote) has this long; then the card picks. */
  CHOICE_MS: 15000,
  /** A card to read: 4.5 s + 1.5 s a line, at most 9 s (everyone tapping Next ends it sooner). */
  SAY_MS: 4500, SAY_LINE_MS: 1500, SAY_MAX_MS: 9000,
  /** The epilogue card. */
  END_MS: 22000,
  /** A CPU leader picks after 1.5-3.5 s; a leader whose phone has gone is picked for after 1.2 s. */
  CPU_MIN_MS: 1500, CPU_MAX_MS: 3500, AWAY_MS: 1200,
  /** Everyone has picked / tapped Next: the card closes this much later. */
  CLOSE_MS: 700,
});
const sayMs = card => Math.min(STORY_TIMES.SAY_MAX_MS, STORY_TIMES.SAY_MS + STORY_TIMES.SAY_LINE_MS * (card.lines?.length || 1));

/**
 * ctx (from room.js): { data, arcId, beats, rng, cpuRng, now, match, seated(), setPhase(p, msg, ms), cast(obj),
 *   gamesFor(n), startGame(id), finish(), log }
 */
export function createStoryRun(ctx) {
  const { now, match, rng, cpuRng } = ctx;
  const people = () => ctx.seated().map(m => ({ pid: m.pid, name: m.name, cpu: !!m.cpu, away: !m.connected }));
  const story = createStory({ data: ctx.data, arcId: ctx.arcId === 'random' ? null : ctx.arcId, beats: ctx.beats, rng: rng.fork ? rng.fork() : rng, players: people,
    award: (pid, n) => { if (pid in match.points) match.points[pid] += n; } });
  let cur = null, ended = false, started = false, epi = null, pending = null;   // pending: an encounter's outcome card, shown after the results
  match.round = 0; match.rounds = story.chapters; match.storyArc = story.arc.id;

  function show(card) {
    match.round = Math.max(1, story.chapter);
    const ms = Math.round((card.choices ? STORY_TIMES.CHOICE_MS : card.kind === 'end' ? STORY_TIMES.END_MS : sayMs(card)) * (ctx.slow || 1));   // M3: Relaxed timers
    cur = { card, ends: now() + ms, votes: {}, ready: [], cpuAt: {}, closeAt: null };
    ctx.setPhase('story', { card, votes: cur.votes, ready: cur.ready }, ms);
  }
  /** Who may answer this card: the leader alone, or everyone seated (a vote). */
  const voters = () => (cur.card.who === 'vote' ? people() : people().filter(p => p.pid === cur.card.lead));
  /** Move the story on to its next card, or a minigame, or the end. */
  function advance() {
    if (ended) return;
    const step = story.next();
    if (step.t === 'card') return show(step.card);
    if (step.t === 'game') return ctx.startGame(pickGame(step.hook));
    if (step.t === 'end') {
      epi = story.epilogue({ ...match.points });
      match.storyEnd = epi;
      return show({ n: story.cardNo + 1, kind: 'end', chapter: story.chapters, chapters: story.chapters, arc: story.arc.id, arcTitle: story.arc.title, icon: story.arc.icon || '★', title: epi.won ? 'The End' : 'The End… for now', lines: epi.lines, end: epi, lead: null });
    }
  }
  /** The minigame for an encounter: from the room's own list (its pool, the season, CPU seats), not played yet. */
  function pickGame(hook = {}) {
    const n = Math.max(1, ctx.seated().filter(m => m.connected || m.cpu).length);
    const pool = ctx.gamesFor(n);
    const fresh = pool.filter(id => !match.played.includes(id)), base = fresh.length ? fresh : pool.filter(id => id !== match.lastGame).length ? pool.filter(id => id !== match.lastGame) : pool;
    const coopOk = id => hook.coop == null || (GAMES[id]?.meta.scoring === 'coop') === !!hook.coop;
    const kindOk = id => !hook.kinds?.length || hook.kinds.some(k => hasKind(id, k));
    const tiers = [base.filter(id => (hook.prefer || []).includes(id)), base.filter(id => kindOk(id) && coopOk(id)), base.filter(coopOk), base.filter(kindOk), base];
    const list = tiers.find(t => t.length) || pool;
    return list[Math.floor(rng() * list.length)];
  }
  function pick(i, by) {
    cur = null;
    const out = story.choose(i, { voters: by });
    if (out) show(out); else advance();
  }
  /** Close a choice card: the leader's pick, or the vote (people first; CPUs only break a tie), or a pick for them. */
  function closeChoice() {
    const c = cur.card, n = c.choices.length;
    const votes = Object.entries(cur.votes).map(([pid, i]) => [+pid, i]);
    if (c.who !== 'vote') { const mine = votes.find(([pid]) => pid === c.lead); return pick(mine ? mine[1] : Math.floor(cpuRng() * n), c.lead != null ? [c.lead] : []); }
    const isCpu = pid => people().find(p => p.pid === pid)?.cpu;
    const tally = Array(n).fill(0);
    for (const [pid, i] of votes) if (!isCpu(pid)) tally[i]++;
    const top0 = Math.max(...tally);
    for (const [pid, i] of votes) if (isCpu(pid) && tally[i] === top0) tally[i] += 0.5;
    const best = Math.max(...tally), tied = tally.map((v, i) => (v === best ? i : -1)).filter(i => i >= 0);
    const i = tied[Math.floor(rng() * tied.length)];
    ctx.cast({ t: 'sv', votes: cur.votes, ready: cur.ready, pick: i });
    return pick(i, votes.filter(([, v]) => v === i).map(([pid]) => pid));
  }
  function tick(t) {
    if (!cur || ended) return;
    const c = cur.card;
    if (c.choices) {
      // CPUs (and a leader whose phone has gone) answer at a person's pace
      for (const p of voters()) {
        if (p.pid in cur.votes || !(p.cpu || p.away)) continue;
        cur.cpuAt[p.pid] ??= t + (p.cpu ? STORY_TIMES.CPU_MIN_MS + cpuRng() * (STORY_TIMES.CPU_MAX_MS - STORY_TIMES.CPU_MIN_MS) : STORY_TIMES.AWAY_MS);
        if (t >= cur.cpuAt[p.pid]) { cur.votes[p.pid] = Math.floor(cpuRng() * c.choices.length); ctx.cast({ t: 'sv', votes: cur.votes, ready: cur.ready }); }
      }
      const all = voters();
      if (all.length && all.every(p => p.pid in cur.votes)) cur.closeAt ??= t + STORY_TIMES.CLOSE_MS;
      if (t >= cur.ends || (cur.closeAt != null && t >= cur.closeAt)) closeChoice();
      return;
    }
    const humans = people().filter(p => !p.cpu && !p.away);
    if (humans.length && humans.every(p => cur.ready.includes(p.pid))) cur.closeAt ??= t + STORY_TIMES.CLOSE_MS;
    if (t >= cur.ends || (cur.closeAt != null && t >= cur.closeAt)) {
      if (c.kind === 'end') { ended = true; cur = null; return ctx.finish(); }
      cur = null; advance();
    }
  }
  /** A phone's tap: { t: 'vote', i } on a choice card, { t: 'skip' } = Next on a card to read. */
  function act(m, msg) {
    if (!cur || m.seat == null) return;
    const c = cur.card;
    if (msg.t === 'vote' && c.choices) {
      if (!(Number.isInteger(msg.i) && msg.i >= 0 && msg.i < c.choices.length)) return;
      if (c.who !== 'vote' && m.pid !== c.lead) return;
      cur.votes[m.pid] = msg.i; ctx.cast({ t: 'sv', votes: cur.votes, ready: cur.ready });
    } else if (msg.t === 'skip' && !c.choices) {
      if (!cur.ready.includes(m.pid)) cur.ready.push(m.pid);
      ctx.cast({ t: 'sv', votes: cur.votes, ready: cur.ready });
    }
  }
  /** room.js endGame: the encounter's result (shown when the room comes back from the results card). */
  function gameResult(res, players) { pending = story.gameResult(res, players) || null; }
  /** room.js nextRound: back from a minigame's results — its outcome card, else the next thing. */
  function resume() { if (!started) { started = true; return advance(); } if (pending) { const c = pending; pending = null; return show(c); } advance(); }

  /** About how long is left (ms), for the match clock. */
  function left() {
    if (ended) return 0;
    const n = Math.max(1, ctx.seated().length), pool = ctx.gamesFor(n);
    let ms = cur ? Math.max(0, cur.ends - now()) : 0;
    ms += slotsMs(story.slotsLeft, { players: n, pool, times: ctx.times });
    if (cur?.card.game || story.pending?.t === 'game') ms += gameRoundMs({ players: n, pool, times: ctx.times }) + sayCardMs();
    return Math.round(ms);
  }
  return { story, tick, act, gameResult, resume, left, get epilogue() { return epi; }, get card() { return cur?.card || null; } };
}

// ------------------------------------------------------------------ how long a story takes (Expansion 1 M2's estimates)
const choiceCardMs = () => STORY_TIMES.CHOICE_MS * PACE.VOTE_SHARE;
const sayCardMs = () => (STORY_TIMES.SAY_MS + 2 * STORY_TIMES.SAY_LINE_MS) * PACE.RESULTS_SHARE;
/** One minigame inside a story: intro + the game + its results card (no vote: the story picks it). */
function gameRoundMs({ players, pool, times }) { const p = roundParts({ mode: 'marathon', players, pool, times }); return p.intro + p.game + p.results; }
function slotsMs(slots, o) {
  let ms = 0;
  for (const s of slots) {
    if (s.slot === 'hook' || s.slot === 'interlude') ms += choiceCardMs() + sayCardMs();
    else if (s.slot === 'beat' || s.slot === 'climax') ms += choiceCardMs() + sayCardMs() + gameRoundMs(o) + sayCardMs();
  }
  return ms + STORY_TIMES.END_MS * PACE.RESULTS_SHARE * 0.6;
}
/** The lobby: minutes for each story length (3, 4, 5 beats). */
export function storyEstimates({ players = 4, pool = null, times }) {
  return Object.fromEntries([3, 4, 5].map(b => [b, Math.max(1, Math.round(storyMs({ beats: b, players, pool, times }) / 60000))]));
}
export function storyMs({ beats = STORY.DEF_BEATS, players = 4, pool = null, times }) {
  const n = Math.max(STORY.MIN_BEATS, Math.min(STORY.MAX_BEATS, beats));
  const slots = [{ slot: 'hook' }, ...Array.from({ length: n }, () => ({ slot: 'beat' })), ...Array.from({ length: n === 3 ? 1 : 2 }, () => ({ slot: 'interlude' })), { slot: 'climax' }];
  return slotsMs(slots, { players, pool, times });
}
