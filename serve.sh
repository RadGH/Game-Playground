#!/usr/bin/env bash
# Serves the whole playground on port 8400 (static files + the small sync API in tools/serve.py).
# Usage: ./serve.sh            (foreground)
#        ./serve.sh --bg       (background, logs to /tmp/playground-serve.log)
# View from the host machine at http://<LAN-IP>:8400/  (LAN IP: hostname -I | awk '{print $1}')
cd "$(dirname "$0")"
PORT=${PORT:-8400}
if [ "$1" = "--bg" ]; then
  if ss -tln | grep -q ":$PORT "; then echo "Already listening on $PORT (restart: pkill -f 'http.server $PORT'; pkill -f 'tools/serve.py'; ./serve.sh --bg)"; exit 0; fi
  nohup python3 tools/serve.py "$PORT" > /tmp/playground-serve.log 2>&1 &
  echo "Serving on http://$(hostname -I | awk '{print $1}'):$PORT/"
else
  echo "Serving on http://$(hostname -I | awk '{print $1}'):$PORT/"
  python3 tools/serve.py "$PORT"
fi
