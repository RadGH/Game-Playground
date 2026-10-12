// Thousandvale — what Thousandvale changes in Farhold's SKILL TABLE (play-test 5: T3 direct heals, T4 revives). Pure.
//
// Farhold's data/skills.json is shared with a live game, so nothing is written there: data/rules/skills-tv.json
// is applied to the loaded table IN MEMORY at engine boot (js/rules/engine.js), before the talent trees are
// rewritten, so a new skill's own tree goes through the same policy as every other.
//   * `patch` — fields merged onto an existing row (`forms` per form; null removes a field);
//   * `add`   — whole new rows (a revive per class), each with a talent tree;
//   * `classes` — a class's six skill ids, by key.
// A row's `tv` block is what only Thousandvale's rules read (js/rules/cast-skills.js) and what
// js/rules/wording.js writes the extra card sentences from.
//
// The parity fixtures compare against Farhold's own table, so they build their engine with `tvSkills: false`.

/** Apply `cfg` (skills-tv.json) to `skillData` (Farhold's skills.json, loaded fresh). Idempotent. Returns a report. */
export function installTvSkills(skillData, cfg) {
  const report = { patched: [], added: [], classes: [], missing: [] };
  if (!skillData?.skills || !cfg || skillData._tvSkills) return report;
  for (const [id, p] of Object.entries(cfg.patch || {})) {
    const row = skillData.skills[id];
    if (!row) { report.missing.push(id); continue; }
    for (const [k, v] of Object.entries(p)) {
      if (k === 'forms') {
        row.forms = { ...(row.forms || {}) };
        for (const [f, fv] of Object.entries(v || {})) row.forms[f] = { ...(row.forms[f] || {}), ...fv };
      } else if (k === 'tv') row.tv = { ...(row.tv || {}), ...v };
      else if (v === null) delete row[k];
      else row[k] = v;
    }
    row.tvPatched = true;
    report.patched.push(id);
  }
  for (const [id, row] of Object.entries(cfg.add || {})) {
    if (skillData.skills[id]) { report.missing.push(`${id} (exists)`); continue; }
    skillData.skills[id] = { ...JSON.parse(JSON.stringify(row)), tvNew: true };
    report.added.push(id);
  }
  for (const [cls, ids] of Object.entries(cfg.classes || {})) {
    if (!skillData.classes?.[cls]) { report.missing.push(`class ${cls}`); continue; }
    const bad = ids.filter(id => !skillData.skills[id]);
    if (bad.length || ids.length !== skillData.classes[cls].length) { report.missing.push(`class ${cls}: ${bad.join(',') || 'wrong count'}`); continue; }
    skillData.farholdClasses = skillData.farholdClasses || {};
    skillData.farholdClasses[cls] = skillData.classes[cls];
    skillData.classes[cls] = [...ids];
    report.classes.push(cls);
  }
  skillData.healers = [...(cfg.healers || [])];
  skillData._tvSkills = true;
  return report;
}

/** The revive block of a row (talented or not), or null. */
export const reviveOf = row => row?.tv?.revive || null;

/**
 * The healer check (T3): the class's key 1 or key 2 is a direct heal that can be aimed at an ally.
 * Returns the slot (1 | 2) or 0.
 */
export function directHealSlot(skillData, classId) {
  const ids = skillData.classes?.[classId] || [];
  for (const i of [0, 1]) {
    const row = skillData.skills[ids[i]];
    if (row && typeof row.heal === 'number' && row.heal > 0 && ['self', 'around', 'ground'].includes(row.shape)) return i + 1;
  }
  return 0;
}

/**
 * Owner feedback 10 (Y32): classes that exist only in Thousandvale (data/rules/classes-tv.json — the Starcaller). Their
 * class rows go into the loaded class list and their skills and skill lists into the loaded skill table, IN MEMORY,
 * before the talent trees are rewritten — so a new class is built, checked and described by exactly the code every
 * other class goes through. Idempotent. Returns `{ classes: [id], skills: [id], skipped: [why] }`.
 */
export function installTvClasses(classData, skillData, cfg) {
  const report = { classes: [], skills: [], skipped: [] };
  if (!cfg || !classData?.classes || !skillData?.skills || skillData._tvClasses) return report;
  for (const [id, row] of Object.entries(cfg.skills || {})) {
    if (skillData.skills[id]) { report.skipped.push(`skill ${id} exists`); continue; }
    skillData.skills[id] = { ...JSON.parse(JSON.stringify(row)), tvNew: true };
    report.skills.push(id);
  }
  for (const row of cfg.classes || []) {
    if (!row?.id || classData.classes.some(c => c.id === row.id)) { report.skipped.push(`class ${row?.id} exists`); continue; }
    const missing = (row.skills || []).filter(id => !skillData.skills[id]);
    if (missing.length || (row.skills || []).length !== 6) { report.skipped.push(`class ${row.id}: ${missing.join(',') || 'needs six skills'}`); continue; }
    classData.classes.push(JSON.parse(JSON.stringify(row)));
    skillData.classes[row.id] = [...row.skills];
    report.classes.push(row.id);
  }
  skillData._tvClasses = true;
  return report;
}
/** The falling-star block of a row (`tv.sky`), or null. */
export const skyOf = row => row?.tv?.sky || null;
