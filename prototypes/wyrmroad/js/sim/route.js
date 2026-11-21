// The road a hero walks: Act I for everyone, then Acts II and III chosen by the hero's two choices (docs/STORY.md).
// Pure (no DOM), shared by the map, saves, story screens, the online host and the bots.
//
//   mergeActs(data)                    once at load: appends Acts II/III chapters + story to data.chapters / data.story
//   routeFor(data, choices)            → chapter ids this hero's road holds so far, in order
//   routeChapters(data, choices)       → the chapter objects
//   choiceAt(data, chapterId, choices) → { key: 'act1' | 'act2', scene } when this chapter's outro holds a choice
//   applyChoice(story, key, pick)      sets a choice (and clears the later one if the road changed)
//   progressOf(data, story)            → { route, reached, done, act, ending } (reached = first chapter not done)
//   actOf(data, chapterId)             → 1 | 2 | 3
//   normStory(story)                   cleans a saved story object (old saves: `ending` was the Act I choice)

const ACT1 = ['free', 'hold'];
const ACT2 = { free: ['bond', 'seal'], hold: ['crown', 'break'] };

/** Append Acts II and III to the loaded data, once. data.acts = acts.json, data.storyActs = story-acts.json. */
export function mergeActs(data) {
  if (!data.acts || data._actsMerged) return data;
  const have = new Set(data.chapters.chapters.map(c => c.id));
  for (const c of data.acts.chapters) if (!have.has(c.id)) data.chapters.chapters.push(c);
  const s = data.storyActs;
  if (s) {
    Object.assign(data.story.speakers, s.speakers);
    Object.assign(data.story.scenes, s.scenes);
    Object.assign(data.story.lines, s.lines);
  }
  data._actsMerged = true;
  return data;
}

export function normStory(st = {}) {
  const choices = { ...(st.choices || {}) };
  if (!choices.act1 && ACT1.includes(st.ending)) choices.act1 = st.ending;   // round-1 saves
  if (!ACT1.includes(choices.act1)) delete choices.act1;
  if (!choices.act1 || !ACT2[choices.act1].includes(choices.act2)) delete choices.act2;
  return {
    reached: Math.max(0, +st.reached || 0),
    done: Array.isArray(st.done) ? [...new Set(st.done.filter(x => typeof x === 'string'))] : [],
    ending: choices.act1 || null,               // kept for old readers: the Act I choice
    choices,
    finale: typeof st.finale === 'string' ? st.finale : null,
    endings: Array.isArray(st.endings) ? [...new Set(st.endings.filter(x => typeof x === 'string'))] : [],
  };
}

export function routeFor(data, choices = {}) {
  const R = (data.acts || {}).routes;
  if (!R) return data.chapters.chapters.slice(0, 6).map(c => c.id);
  const ids = [...R.act1];
  if (choices.act1 && R.act2[choices.act1]) {
    ids.push(...R.act2[choices.act1]);
    const k3 = `${choices.act1}.${choices.act2}`;
    if (choices.act2 && R.act3[k3]) ids.push(...R.act3[k3]);
  }
  return ids;
}

export function routeChapters(data, choices) {
  const byId = new Map(data.chapters.chapters.map(c => [c.id, c]));
  return routeFor(data, choices).map(id => byId.get(id)).filter(Boolean);
}

export function actOf(data, chapterId) {
  const c = data.chapters.chapters.find(x => x.id === chapterId);
  return c?.act || 1;
}

/** The choice a chapter's outro scene holds, if any. */
export function choiceAt(data, chapterId, choices = {}) {
  const A = data.acts;
  if (!A) return null;
  const c = data.chapters.chapters.find(x => x.id === chapterId);
  if (!c) return null;
  if (c.outro === A.choices.act1) return { key: 'act1', scene: c.outro };
  for (const [k, scene] of Object.entries(A.choices)) if (k.startsWith('act2.') && c.outro === scene) return { key: 'act2', scene };
  return null;
}

/** Record a choice. Changing Act I's choice clears Act II's (that road no longer exists). */
export function applyChoice(story, key, pick) {
  story.choices = story.choices || {};
  if (key === 'act1') {
    if (!ACT1.includes(pick)) return story;
    if (story.choices.act1 !== pick) delete story.choices.act2;
    story.choices.act1 = pick;
    story.ending = pick;
  } else if (key === 'act2') {
    if (!ACT2[story.choices.act1]?.includes(pick)) return story;
    story.choices.act2 = pick;
  }
  return story;
}

/** Where the hero is on their road. reached = index of the first chapter not done (or the last one when all are). */
export function progressOf(data, story) {
  const st = normStory(story);
  const route = routeFor(data, st.choices);
  // A choice chapter with no choice yet ends the road, so "all done" lands on it and the map offers it again.
  let reached = route.findIndex(id => !st.done.includes(id));
  if (reached < 0) reached = route.length - 1;
  const act = actOf(data, route[reached]);
  return { route, reached, done: st.done, act, choices: st.choices, finale: st.finale };
}
