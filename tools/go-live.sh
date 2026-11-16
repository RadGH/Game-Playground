#!/usr/bin/env bash
# go-live.sh <game> [game…] — put playground games live on games.radgh.com in one go (owner 2026-11-15: "push it live,
# always do that"). The four steps used to be run by hand, and a step was sometimes missed:
#
#   1. tools/publish-stable.sh   syntax check, unit tests, each changed game's pre-publish check -> `stable` (port 8400)
#   2. tools/publish-pages.sh    the stable snapshot -> gh-pages on GitHub (only changed files upload)
#   3. rads-game-server tools/deploy.sh update playground <game…>   the droplet downloads it; each game's `updated` is stamped
#   4. commit + push the RGS repo (games.json changed)
#
# Before step 1 it checks each game has a games.json entry with a card picture (a NEW game needs both — see
# ~/claude/docs/rgs.md) and warns when the game's What's new list has nothing newer than its last release.
# Games with their own server (Thousandvale, Tumblefair, Knockabout, Roverlands, Rogueloot) have their own publish
# scripts; this refuses them and says so.
#
# Usage: tools/go-live.sh grimring            promote HEAD and ship grimring
#        tools/go-live.sh --ref <sha> farhold   promote a specific commit
#        tools/go-live.sh --check grimring      only the checks above, nothing moves
#        tools/go-live.sh --force grimring      pass --force to publish-stable (skip tests — only for failures older than the change)
set -euo pipefail
cd "$(dirname "$0")/.."
RGS="${RGS_REPO:-$HOME/claude/rads-game-server}"

REF=HEAD; FORCE=(); GAMES=(); CHECK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF=$2; shift 2 ;;
    --force) FORCE=(--force); shift ;;
    --check) CHECK=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) GAMES+=("$1"); shift ;;
  esac
done
(( ${#GAMES[@]} )) || { sed -n '2,20p' "$0"; exit 2; }

# ---- checks before anything moves ----
for g in "${GAMES[@]}"; do
  node -e '
    const [slug, rgs] = process.argv.slice(1);
    const fs = require("fs");
    const all = JSON.parse(fs.readFileSync(rgs + "/games.json", "utf8")).games;
    const g = all.find(x => x.slug === slug || x.path === `prototypes/${slug}/`);
    if (!g) { console.error(`✗ ${slug}: no entry in ${rgs}/games.json. A new game needs one entry + a real 1280x720 screenshot in site/img/ (docs/rgs.md), then run this again.`); process.exit(1); }
    if (g.type !== "playground") { console.error(`✗ ${slug}: type "${g.type}" has its own publish script (see its README and docs/rgs.md deploy map).`); process.exit(1); }
    if (!fs.existsSync(rgs + "/site/" + g.image)) { console.error(`✗ ${slug}: card picture ${g.image} is missing in ${rgs}/site/.`); process.exit(1); }
    const cl = `prototypes/${g.path.split("/")[1]}/data/changelog.json`;
    if (!fs.existsSync(cl)) { console.error(`! ${slug}: no ${cl} — every published game needs a What\x27s new list.`); process.exit(0); }
    const list = JSON.parse(fs.readFileSync(cl, "utf8"));
    const entries = Array.isArray(list) ? list : (list.entries || list.updates || []);
    const newest = entries.map(e => String(e.date || e.id || "")).sort().pop() || "";
    const last = String(g.updated || "").slice(0, 10);
    if (newest.slice(0, 10) < last) console.error(`! ${slug}: What\x27s new has nothing since ${last} — add a player-language entry if players will notice this release.`);
    console.log(`✓ ${slug}: listed as "${g.title}" (${g.category === "playable" ? "Playable" : "Prototype"})`);
  ' "$g" "$RGS"
done

[ "$CHECK" = 1 ] && exit 0

# ---- 1-2: stable, then GitHub Pages ----
tools/publish-stable.sh "${FORCE[@]}" "$REF"
tools/publish-pages.sh

# ---- 3: the droplet ----
SLUGS=()
for g in "${GAMES[@]}"; do
  SLUGS+=("$(node -e 'const [s, r] = process.argv.slice(1); const g = JSON.parse(require("fs").readFileSync(r + "/games.json", "utf8")).games.find(x => x.slug === s || x.path === `prototypes/${s}/`); console.log(g.slug)' "$g" "$RGS")")
done
( cd "$RGS" && tools/deploy.sh update playground "${SLUGS[@]}" )

# ---- 4: record it ----
if ! git -C "$RGS" diff --quiet -- games.json; then
  git -C "$RGS" add games.json
  git -C "$RGS" commit -q -m "games.json: ${SLUGS[*]} updated (go-live)"
  git -C "$RGS" push -q origin HEAD
  echo "== RGS repo committed and pushed"
fi
echo
for s in "${SLUGS[@]}"; do echo "LIVE: https://games.radgh.com/$s/"; done
echo "Check it in a browser (desktop + phone) before saying it's done."
