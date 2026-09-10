#!/usr/bin/env bash
# Serves the whole playground as static files on port 8400.
# Usage: ./serve.sh            (foreground)
#        ./serve.sh --bg       (background, logs to /tmp/playground-serve.log)
# View from the host machine at http://<LAN-IP>:8400/  (LAN IP: hostname -I | awk '{print $1}')
cd "$(dirname "$0")"
PORT=${PORT:-8400}
if [ "$1" = "--bg" ]; then
  if ss -tln | grep -q ":$PORT "; then echo "Already listening on $PORT"; exit 0; fi
  nohup python3 -m http.server "$PORT" --bind 0.0.0.0 > /tmp/playground-serve.log 2>&1 &
  echo "Serving on http://$(hostname -I | awk '{print $1}'):$PORT/"
else
  echo "Serving on http://$(hostname -I | awk '{print $1}'):$PORT/"
  python3 -m http.server "$PORT" --bind 0.0.0.0
fi
