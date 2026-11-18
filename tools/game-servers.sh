#!/usr/bin/env bash
# Game servers on this VM run only while needed (owner 2026-11-16: "halt all the local game servers on this machine,
# unless they are used for testing ... New games could have a hosted server for 1 day, after that they should be shut
# down unless I ask for them or unless you need to work on them"). The owner plays on games.radgh.com; the VM is short
# on memory (each game server is ~50-220 MB, ~1.2 GB in all before this).
#
# A "game server" = a systemd USER unit whose name, minus -dev / -quick-tunnel / similar, is a folder in
# playground/prototypes/ (tumblefair, rogueloot-dev, thousandvale-quick-tunnel …). New games are covered automatically.
# NOT touched: the playground page servers (8400/8401, tools/serve-both.sh — experiments + prototypes stay up), Voice
# Lab's kokoro-tts, rgs-api-dev, Claude/Codex remote sessions, anything not named after a game.
#
#   tools/game-servers.sh status            every game server: running?, for how long, memory, starts on boot?, kept until
#   tools/game-servers.sh start <unit>      start one for work/testing (the reaper stops it a day later)
#   tools/game-servers.sh keep <unit> [days|forever]   owner asked to keep it up: start it and skip the reaper (default 7 days)
#   tools/game-servers.sh unkeep <unit>
#   tools/game-servers.sh stop <unit>|all
#   tools/game-servers.sh reap              (hourly timer) stop game servers running > 24 h that aren't kept; never start on boot
#   tools/game-servers.sh install-timer     install the hourly reaper (safe to run again)
set -u
PROTO="$HOME/claude/playground/prototypes"
KEEP="$HOME/.config/game-servers/keep"          # lines: <unit> <epoch seconds until | 0 = forever>
MAX_AGE=${GAME_SERVERS_MAX_AGE:-$((24 * 3600))}   # seconds; the env var is only for testing
mkdir -p "$(dirname "$KEEP")"; touch "$KEEP"

games() {   # every user unit named after a prototype folder
  { systemctl --user list-unit-files --type=service --no-legend; systemctl --user list-units --type=service --all --no-legend --plain; } 2>/dev/null \
    | awk '{print $1}' | grep '\.service$' | sed 's/\.service$//' | sort -u | while read -r u; do
    case "$u" in game-servers*) continue ;; esac
    # the longest name a prototype folder has: knockabout-dev → knockabout, overdrive-frame-dev → overdrive-frame
    b=$u; while :; do if [ -d "$PROTO/$b" ] || [ -L "$PROTO/$b" ]; then echo "$u"; break; fi; [[ "$b" == *-* ]] || break; b=${b%-*}; done
  done
}
kept_until() { awk -v u="$1" '$1 == u { print $2 }' "$KEEP" | tail -1; }
is_kept() { local t; t=$(kept_until "$1"); [ -n "$t" ] && { [ "$t" = 0 ] || [ "$t" -gt "$(date +%s)" ]; }; }
age_s() {   # seconds since the unit last started (empty if not running)
  local ts; [ "$(systemctl --user is-active "$1")" = active ] || return 0
  ts=$(systemctl --user show -p ActiveEnterTimestamp --value "$1"); [ -n "$ts" ] || return 0
  echo $(( $(date +%s) - $(date -d "$ts" +%s) ))
}
mem_mb() { local p; p=$(systemctl --user show -p MainPID --value "$1"); [ "${p:-0}" -gt 0 ] || { echo 0; return; }
  ps -o rss= --ppid "$p" -p "$p" 2>/dev/null | awk '{s+=$1} END {print int(s/1024)}'; }
is_game() { games | grep -qx "$1" || { echo "not a game server: $1 (see tools/game-servers.sh status)"; exit 1; }; }

case "${1:-status}" in
  status)
    printf '%-28s %-8s %-9s %-7s %-9s %s\n' UNIT STATE UP MEMORY ON-BOOT KEPT
    for u in $(games); do
      a=$(age_s "$u"); st=$(systemctl --user is-active "$u"); en=$(systemctl --user is-enabled "$u" 2>/dev/null)
      up=-; [ -n "$a" ] && up="$((a / 3600))h$(( (a % 3600) / 60 ))m"
      k=-; t=$(kept_until "$u"); if is_kept "$u"; then [ "$t" = 0 ] && k=forever || k="until $(date -d "@$t" '+%b %d %H:%M')"; fi
      printf '%-28s %-8s %-9s %-7s %-9s %s\n' "$u" "$st" "$up" "$(mem_mb "$u")MB" "$en" "$k"
    done ;;
  start) is_game "$2"; systemctl --user start "$2" && echo "started $2 — stops by itself after 24 h (keep it with: $0 keep $2)" ;;
  keep)
    is_game "$2"; d=${3:-7}; [ "$d" = forever ] && until=0 || until=$(( $(date +%s) + d * 86400 ))
    grep -v "^$2 " "$KEEP" > "$KEEP.tmp"; echo "$2 $until" >> "$KEEP.tmp"; mv "$KEEP.tmp" "$KEEP"
    systemctl --user start "$2"; echo "keeping $2 ${d/forever/forever}$([ "$d" != forever ] && echo ' days')" ;;
  unkeep) grep -v "^$2 " "$KEEP" > "$KEEP.tmp"; mv "$KEEP.tmp" "$KEEP"; echo "$2 is no longer kept (stops after 24 h up)" ;;
  stop)
    if [ "${2:-}" = all ]; then for u in $(games); do systemctl --user stop "$u"; done; echo "stopped every game server"
    else is_game "$2"; systemctl --user stop "$2" && echo "stopped $2"; fi ;;
  reap)
    for u in $(games); do
      # never start on boot: a publish or install script may have run `enable`
      # NOT `systemctl disable`: the game units are `systemctl link`ed from each game's ops/ folder, and disable deletes
      # a linked unit file outright (2026-11-16: it removed all 11 and left Rogueloot running unseen). Remove only the
      # start-on-boot links.
      if [ "$(systemctl --user is-enabled "$u" 2>/dev/null)" = enabled ]; then
        rm -f "$HOME"/.config/systemd/user/*.wants/"$u".service; systemctl --user daemon-reload
        echo "$(date '+%F %T') no longer starts on boot: $u"
      fi
      is_kept "$u" && continue
      a=$(age_s "$u"); [ -n "$a" ] && [ "$a" -gt "$MAX_AGE" ] || continue
      systemctl --user stop "$u" && echo "$(date '+%F %T') stopped $u after $((a / 3600)) h (not kept)"
    done ;;
  install-timer)
    D="$HOME/.config/systemd/user"; self=$(readlink -f "$0")
    cat > "$D/game-servers-reap.service" <<EOF
[Unit]
Description=Stop game servers that have run over a day (playground/tools/game-servers.sh)
[Service]
Type=oneshot
ExecStart=$self reap
EOF
    cat > "$D/game-servers-reap.timer" <<EOF
[Unit]
Description=Hourly: stop game servers that have run over a day
[Timer]
OnBootSec=10min
OnUnitActiveSec=1h
Persistent=true
[Install]
WantedBy=timers.target
EOF
    systemctl --user daemon-reload && systemctl --user enable --now game-servers-reap.timer && echo "reaper timer installed" ;;
  *) sed -n '2,20p' "$0"; exit 1 ;;
esac
