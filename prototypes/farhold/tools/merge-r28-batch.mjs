#!/usr/bin/env node
/**
 * Round 28 content merge: copy one batch's staging file into the real data files.
 *
 * Five content agents author classes at the same time. If each of them edited
 * data/skills.json directly, one agent's write would silently throw away another's,
 * because every write is a whole-file read-modify-write. So each batch keeps its rows
 * in its OWN file (data/r28-batches/<batch>.json) and this tool is the only thing that
 * writes skills.json / classes.json. It takes an exclusive lock first, so two merges
 * can never overlap, and it re-runs describe-skills.mjs inside the same lock (that
 * tool rewrites skills.json too).
 *
 * Staging file shape (every key optional):
 *   {
 *     "skills":   { "<skillId>": { ...whole row... } },   // replaces the row wholesale
 *     "statuses": { "<statusId>": { ...row... } },
 *     "classes":  { "<classId>": ["id1", ..., "id6"] }     // written to BOTH files
 *   }
 *
 * Usage (from anywhere):
 *   node prototypes/farhold/tools/merge-r28-batch.mjs b2
 *   node prototypes/farhold/tools/merge-r28-batch.mjs b2 --dry    (report only)
 *
 * Safe to run more than once: the same staging file always produces the same result.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = '/tmp/claude-1000/farhold-skills-merge.lock';

const batch = process.argv[2];
const dry = process.argv.includes('--dry');
if (!batch) {
	console.error('usage: merge-r28-batch.mjs <batch> [--dry]');
	process.exit(2);
}

// Re-run ourselves under flock so the lock covers the whole read-modify-write.
if (!process.env.R28_MERGE_LOCKED) {
	fs.mkdirSync(path.dirname(LOCK), { recursive: true });
	execFileSync('flock', [LOCK, process.execPath, ...process.argv.slice(1)], {
		stdio: 'inherit',
		env: { ...process.env, R28_MERGE_LOCKED: '1' },
	});
	process.exit(0);
}

const stagePath = path.join(ROOT, 'data', 'r28-batches', `${batch}.json`);
const skillsPath = path.join(ROOT, 'data', 'skills.json');
const classesPath = path.join(ROOT, 'data', 'classes.json');

const stage = JSON.parse(fs.readFileSync(stagePath, 'utf8'));
const skills = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
const classes = JSON.parse(fs.readFileSync(classesPath, 'utf8'));

const report = { skills: 0, statuses: 0, classes: [] };

for (const [id, row] of Object.entries(stage.skills || {})) {
	skills.skills[id] = row;
	report.skills++;
}
for (const [id, row] of Object.entries(stage.statuses || {})) {
	skills.statuses[id] = row;
	report.statuses++;
}
for (const [cls, list] of Object.entries(stage.classes || {})) {
	const entry = classes.classes.find((c) => c.id === cls);
	if (!entry) throw new Error(`classes.json has no class "${cls}"`);
	for (const id of list) {
		if (!skills.skills[id]) throw new Error(`class ${cls} lists "${id}" but no such skill row exists`);
	}
	skills.classes[cls] = list;
	entry.skills = list;
	report.classes.push(cls);
}

console.log(`merge ${batch}: ${report.skills} skill rows, ${report.statuses} status rows, classes: ${report.classes.join(', ') || 'none'}`);
if (dry) process.exit(0);

// Both files are 1-space indented with a trailing newline.
fs.writeFileSync(skillsPath, JSON.stringify(skills, null, 1) + '\n');
fs.writeFileSync(classesPath, JSON.stringify(classes, null, 1) + '\n');

// Regenerate every row's desc while we still hold the lock.
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'describe-skills.mjs')], { stdio: 'inherit' });
