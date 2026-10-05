#!/usr/bin/env bash
# Thousandvale — pack the bot runner for a SECOND machine (the owner's Windows PC, or a cloud box). Stream H.
#   ops/load/pack-bots.sh                 -> ops/load/dist/thousandvale-bots-<build>.zip, from the PUBLISHED release
#   ops/load/pack-bots.sh --tree <dir>    pack from another tree (e.g. the working tree, to hit a load server running it)
# The bots must speak the SAME protocol version as the server they hit (a mismatch is refused at hello), so by default
# this packs from /srv/thousandvale/current — the release the load server runs by default. run-300.mjs checks too.
# Holds only what the bots need: ops/load/run-300.mjs, tools/bot-client.mjs and the modules it imports (found by
# following the import lines, so a new import is picked up automatically), plus RUN-ON-WINDOWS.txt. No server code,
# no data, no secrets. Needs only Node 22+ on the other machine (it uses Node's built-in WebSocket; no npm install).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME="$(cd "$HERE/../.." && pwd)"
SRC="$GAME"; BUILD="$(git -C "$GAME" rev-parse --short=12 HEAD 2>/dev/null || echo dev)"
if [[ "${1:-}" == --tree ]]; then SRC="$(cd "$2" && pwd)"; BUILD=dev
elif [[ -r /srv/thousandvale/current/app/prototypes/thousandvale/tools/bot-client.mjs ]]; then SRC=/srv/thousandvale/current/app/prototypes/thousandvale; BUILD="$(cat /srv/thousandvale/current/BUILD)"
else echo "   (published release not readable — packing the working tree)"; fi
cd "$SRC"
# the release predates run-300.mjs: always take the runner from this repo (it imports bot-client from ../../tools)
RUNNER="$HERE/run-300.mjs"
FILES="$(node -e '
const fs = require("fs"), path = require("path");
const seen = new Set(), todo = ["tools/bot-client.mjs"];
while (todo.length) {
  const f = path.normalize(todo.pop()); if (seen.has(f)) continue; seen.add(f);
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["\x27](\.[^"\x27]+)["\x27]|import\(\s*(?:resolve\([^,]+,\s*)?["\x27](\.[^"\x27]+)["\x27]/g)) {
    const rel = m[1] || m[2]; todo.push(path.join(path.dirname(f), rel));
  }
}
console.log([...seen].sort().join("\n"));')"
grep -qx 'tools/bot-client.mjs' <<<"$FILES" || { echo "bot-client.mjs missing from the closure" >&2; exit 1; }
OUT="$HERE/dist"; STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$OUT" "$STAGE/thousandvale-bots"
while IFS= read -r f; do mkdir -p "$STAGE/thousandvale-bots/$(dirname "$f")"; cp "$f" "$STAGE/thousandvale-bots/$f"; done <<<"$FILES"
mkdir -p "$STAGE/thousandvale-bots/ops/load"; cp "$RUNNER" "$STAGE/thousandvale-bots/ops/load/run-300.mjs"
echo '{ "type": "module", "private": true }' > "$STAGE/thousandvale-bots/package.json"
cat > "$STAGE/thousandvale-bots/RUN-ON-WINDOWS.txt" <<TXT
Thousandvale 300-bot load run (build $BUILD). Full notes: ops/load/README.md in the repo.
1. Install Node 22 or newer (nodejs.org, LTS). Check:  node --version
2. Unzip this folder anywhere. Open PowerShell in it.
3. On the VM the lead has started the load server:  ops/load/load-server.sh start --pin
4. Run (use the VM's LAN address it printed):
     node ops\load\run-300.mjs --url ws://192.168.1.34:8495
   Optional:  --scenario town   (everyone in one town)   --seconds 600   --bots 300 --procs 6
5. It prints PASSED or FAILED and writes ops\load\results\load-*.json — send that file back (or copy it to the VM).
Windows may ask to allow Node through the firewall: outbound connections need no rule; click Cancel if unsure.
TXT
ZIP="$OUT/thousandvale-bots-$BUILD.zip"; rm -f "$ZIP"
(cd "$STAGE" && zip -qr "$ZIP" thousandvale-bots)
echo "packed $(( $(wc -l <<<"$FILES") + 1 )) files from $SRC (build $BUILD) -> $ZIP"
echo "share it with the owner: http://$(hostname -I | awk '{print $1}'):8401/prototypes/thousandvale/ops/load/dist/$(basename "$ZIP")  (dev server; ops/ is not on the game servers)"
