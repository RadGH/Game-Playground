#!/usr/bin/env bash
# Restart the Rogueloot DEV server (working tree) on 8581 / https 8583 — the `rogueloot-dev` user unit (ops/install.sh).
systemctl --user restart rogueloot-dev
for _ in $(seq 1 20); do curl -fsS -m 1 http://127.0.0.1:8581/healthz >/dev/null 2>&1 && { echo "dev up"; exit 0; }; sleep 0.25; done
echo "dev did not come up"; journalctl --user -u rogueloot-dev -n 8 --no-pager; exit 1
