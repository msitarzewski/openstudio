#!/usr/bin/env bash
set -euo pipefail

# OpenStudio production deployment script
# Target: Ubuntu 22.04+ with Caddy already installed

REPO_URL="https://github.com/msitarzewski/openstudio.git"
INSTALL_DIR="/opt/openstudio"
SERVICE_USER="openstudio"

echo "=== OpenStudio Production Setup ==="

# Create service user
if ! id "$SERVICE_USER" &>/dev/null; then
    echo "Creating user: $SERVICE_USER"
    sudo useradd --system --shell /usr/sbin/nologin --home-dir "$INSTALL_DIR" "$SERVICE_USER"
fi

# Clone or update repo
if [ -d "$INSTALL_DIR" ]; then
    echo "Updating existing installation..."
    cd "$INSTALL_DIR"
    sudo -u "$SERVICE_USER" git pull
else
    echo "Cloning repository..."
    sudo git clone "$REPO_URL" "$INSTALL_DIR"
    sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
fi

# Install dependencies
echo "Installing dependencies..."
cd "$INSTALL_DIR"
sudo -u "$SERVICE_USER" bash -c "cd server && npm install --production"

# Copy production station manifest
echo "Setting up station manifest..."
sudo -u "$SERVICE_USER" cp deploy/station-manifest.production.json station-manifest.json

# Start Docker services (Icecast + coturn)
echo "Starting Docker services..."
cd "$INSTALL_DIR/deploy"
sudo docker compose -f docker-compose.prod.yml up -d

# Install systemd service
echo "Installing systemd service..."
sudo cp "$INSTALL_DIR/deploy/openstudio.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable openstudio
sudo systemctl restart openstudio

# Configure Caddy
echo "Configuring Caddy..."
if ! grep -q "openstudio.zerologic.com" /etc/caddy/Caddyfile 2>/dev/null; then
    sudo cat "$INSTALL_DIR/deploy/Caddyfile" >> /etc/caddy/Caddyfile
    sudo systemctl reload caddy
    echo "Caddy configured with TLS"
else
    echo "Caddy already configured for openstudio.zerologic.com"
fi

echo ""
echo "=== Setup Complete ==="
echo "Service: sudo systemctl status openstudio"
echo "Logs:    sudo journalctl -u openstudio -f"
echo "URL:     https://openstudio.zerologic.com"
