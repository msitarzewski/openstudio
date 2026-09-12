#!/usr/bin/env bash
# OpenStudio production setup — first-run provisioner for a dedicated host.
#
# Target: Ubuntu 22.04+ with Caddy, Docker, Node 18+, and git already installed.
# Safe to re-run: every step is idempotent and nothing is overwritten in place.
#
# This installs OpenStudio as its own system user under /opt, runs Icecast and
# coturn via Docker, and hands you a Caddy site file. It deliberately does NOT
# edit your main Caddyfile — see step 6.
#
# Usage:
#   DOMAIN=studio.example.com bash deploy/setup.sh
#
# If you already run OpenStudio out of a checkout in your home directory under a
# user systemd unit, this script is not for you; deploy with git + a restart.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/msitarzewski/openstudio.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/openstudio}"
SERVICE_USER="${SERVICE_USER:-openstudio}"
DOMAIN="${DOMAIN:-}"
PORT="${PORT:-6736}"

info() { printf '\n== %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -n "$DOMAIN" ] || fail "Set DOMAIN first, e.g.  DOMAIN=studio.example.com bash deploy/setup.sh"

info "[1/7] preflight"
for cmd in git node docker caddy; do
  command -v "$cmd" >/dev/null 2>&1 || fail "Missing required command: $cmd"
done
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || fail "Node 18+ required (found $(node -v))"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 plugin required"
echo "   ok: git, node $(node -v), docker, caddy"

info "[2/7] service user"
if id "$SERVICE_USER" &>/dev/null; then
  echo "   user $SERVICE_USER already exists"
else
  sudo useradd --system --shell /usr/sbin/nologin --home-dir "$INSTALL_DIR" "$SERVICE_USER"
  echo "   created $SERVICE_USER"
fi

info "[3/7] code"
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "   updating existing checkout"
  sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" diff --quiet \
    || fail "$INSTALL_DIR has local modifications; resolve them before re-running"
  sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" fetch --prune origin
  sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" merge --ff-only origin/main
elif [ -e "$INSTALL_DIR" ]; then
  fail "$INSTALL_DIR exists but is not a git checkout; move it aside first"
else
  sudo git clone "$REPO_URL" "$INSTALL_DIR"
  sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
fi

info "[4/7] dependencies"
# npm install, not npm ci: package-lock.json is gitignored in this repo, and
# `npm ci` hard-fails with EUSAGE when no lockfile is present.
sudo -u "$SERVICE_USER" bash -c "cd '$INSTALL_DIR/server' && npm install --omit=dev"

info "[5/7] station manifest"
if [ -f "$INSTALL_DIR/station-manifest.json" ]; then
  echo "   station-manifest.json exists — leaving your settings alone"
else
  sudo -u "$SERVICE_USER" cp "$INSTALL_DIR/deploy/station-manifest.production.json" \
                             "$INSTALL_DIR/station-manifest.json"
  warn "station-manifest.json ships with CHANGE_ME TURN credentials and example"
  warn "STUN/TURN hostnames. Edit it before going live or WebRTC will fail for"
  warn "anyone behind a symmetric NAT."
fi

info "[6/7] Caddy site config (never edits your main Caddyfile)"
CADDY_BLOCK="$(printf '%s {\n\treverse_proxy localhost:%s\n}\n' "$DOMAIN" "$PORT")"
if grep -rqs -- "$DOMAIN" /etc/caddy/ 2>/dev/null; then
  echo "   $DOMAIN already present in /etc/caddy — leaving it alone"
elif [ -d /etc/caddy/sites ]; then
  printf '%s' "$CADDY_BLOCK" | sudo tee "/etc/caddy/sites/${DOMAIN}.caddy" >/dev/null
  echo "   wrote /etc/caddy/sites/${DOMAIN}.caddy"
  echo "   (requires 'import sites/*.caddy' in your main Caddyfile)"
  sudo systemctl reload caddy
else
  warn "No /etc/caddy/sites directory, and appending to a shared Caddyfile could"
  warn "break other sites on this host. Add this block yourself, then reload Caddy:"
  printf '\n%s\n' "$CADDY_BLOCK"
fi

info "[7/7] services"
# Icecast + coturn. Passwords come from the environment — see .env.example.
( cd "$INSTALL_DIR/deploy" && sudo -E docker compose -f docker-compose.prod.yml up -d )

sudo cp "$INSTALL_DIR/deploy/openstudio.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable openstudio
sudo systemctl restart openstudio

for i in $(seq 1 30); do
  curl -sf --max-time 3 "http://localhost:${PORT}/health" >/dev/null 2>&1 && break
  [ "$i" -eq 30 ] && fail "Service did not become healthy; check: sudo journalctl -u openstudio -n 50"
  sleep 1
done

cat <<EOF

== Setup complete

  Health:  $(curl -s --max-time 3 "http://localhost:${PORT}/health")
  Service: sudo systemctl status openstudio
  Logs:    sudo journalctl -u openstudio -f
  URL:     https://${DOMAIN}

Before announcing it: edit station-manifest.json (TURN credentials), and confirm
ICECAST_PORT in deploy/openstudio.service matches where Icecast actually listens.
EOF
