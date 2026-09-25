#!/usr/bin/env bash
# Serve Tiny RTS on port 8460 (static files). View from the host at http://<LAN-IP>:8460/
# Usage: ./tools/serve.sh        (foreground)
#        ./tools/serve.sh --bg   (background, logs to /tmp/tinyrts-serve.log)
cd "$(dirname "$0")/.."
PORT=${PORT:-8460}
if [ "$1" = "--bg" ]; then
  if ss -tln | grep -q ":$PORT "; then echo "Already listening on $PORT"; exit 0; fi
  nohup python3 tools/serve.py "$PORT" > /tmp/tinyrts-serve.log 2>&1 &
  echo "Serving on http://$(hostname -I | awk '{print $1}'):$PORT/"
else
  echo "Serving on http://$(hostname -I | awk '{print $1}'):$PORT/"
  python3 tools/serve.py "$PORT"
fi
