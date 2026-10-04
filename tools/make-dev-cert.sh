#!/usr/bin/env bash
#
# Make a self-signed certificate for the https dev server (tools/serve.py <port> --https).
#
# Why: browsers only expose the Gamepad API on secure pages. http://<LAN IP>:8401 is not secure
# (only localhost is exempt, and the owner browses from another machine), so controller testing
# needs https. The certificate names the VM's LAN IP and localhost; the browser warns once, accept
# it and the page is secure from then on.
#
# Usage: tools/make-dev-cert.sh          (re-run if the LAN IP changes; --force to overwrite)
# Output: tools/certs/dev.crt + dev.key  (git-ignored)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p certs
IP="$(hostname -I | awk '{print $1}')"
if [ -f certs/dev.crt ] && [ "${1:-}" != "--force" ] && openssl x509 -in certs/dev.crt -noout -text | grep -q "IP Address:$IP"; then
  echo "certs/dev.crt already covers $IP (use --force to remake)"; exit 0
fi
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout certs/dev.key -out certs/dev.crt \
  -subj "/CN=playground dev ($IP)" \
  -addext "subjectAltName=IP:$IP,IP:127.0.0.1,DNS:localhost" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "extendedKeyUsage=serverAuth" 2>/dev/null
chmod 600 certs/dev.key
echo "wrote tools/certs/dev.crt for $IP — start with: python3 tools/serve.py 8441 --https"
echo "then open https://$IP:8441/ and accept the browser warning once"
