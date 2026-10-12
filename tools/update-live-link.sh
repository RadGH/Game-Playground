#!/usr/bin/env bash
# update-live-link.sh — refresh data/live-links.json with Thousandvale's current public URL.
#
# The home page's "Live link" button reads data/live-links.json. The link is a Cloudflare quick tunnel
# for now, and a quick tunnel gets a NEW address every time it restarts, so run this after a restart.
#
# It only ASKS for the address (prototypes/thousandvale/ops/tunnel/quick.sh --url). It never starts or
# stops the tunnel. If the tunnel is not running, the file is left exactly as it was.
#
# Usage:
#   tools/update-live-link.sh              # ask the tunnel, rewrite the file if the address changed
#   tools/update-live-link.sh --url <url>  # set it by hand (e.g. the VPS domain later)
#   tools/update-live-link.sh --note "…"   # also replace the note shown under the button
#   tools/update-live-link.sh --check      # print the current and the stored address, change nothing
#
# Safe to run more than once. Remember: the STABLE site (8400) and GitHub Pages only see the new address
# after the change is committed and published (tools/publish-stable.sh, then tools/publish-pages.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

FILE=data/live-links.json
KEY=thousandvale
QUICK=prototypes/thousandvale/ops/tunnel/quick.sh
URL=""; NOTE=""; CHECK=0

while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL=${2:?--url needs an address}; shift 2 ;;
    --note) NOTE=${2:?--note needs text}; shift 2 ;;
    --check) CHECK=1; shift ;;
    -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$URL" ]; then
  URL=$("$QUICK" --url 2>/dev/null || true)
  if [ -z "$URL" ]; then
    echo "the quick tunnel is not running — $FILE left as it is" >&2
    [ "$CHECK" = 1 ] && node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log("stored:  "+(j[process.argv[2]]?.url||"(none)"))' "$FILE" "$KEY"
    exit 1
  fi
fi
case "$URL" in
  https://*) ;;
  *) echo "refusing: '$URL' is not an https address" >&2; exit 1 ;;
esac
case "$URL" in */) ;; *) URL="$URL/" ;; esac

CHECK=$CHECK node - "$FILE" "$KEY" "$URL" "$NOTE" <<'NODE'
const fs = require('fs');
const [file, key, url, note] = process.argv.slice(2);
const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const was = data[key] || {};
if (process.env.CHECK === '1') {
  console.log('current: ' + url); console.log('stored:  ' + (was.url || '(none)'));
  console.log(was.url === url ? 'up to date' : 'OUT OF DATE — run tools/update-live-link.sh');
  process.exit(0);
}
if (was.url === url && !note) { console.log('unchanged: ' + url); process.exit(0); }
data[key] = { ...was, url, note: note || was.note || '', updated: new Date().toISOString().slice(0, 10) };
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log(`${file}: ${key} -> ${url}`);
console.log('commit it, then tools/publish-stable.sh and tools/publish-pages.sh to update 8400 and the public site');
NODE
