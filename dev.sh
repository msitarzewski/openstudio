#!/bin/bash
set -e

# OpenStudio Development Server Manager
# Usage: ./dev.sh [start|stop|restart|status|logs]

COMMAND=${1:-start}

# Required env vars for each mode (key=default pairs)
# Defaults are dev-only placeholders — safe for localhost, unsafe for production.
REQUIRED_DEV_VARS=(
  "DEV_MODE=local"
  "LOCAL_SIGNALING_PORT=6736"
  "ICECAST_SOURCE_PASSWORD=changeme"
  "ICECAST_ADMIN_PASSWORD=changeme"
  "ICECAST_ADMIN_USERNAME=admin"
  "ICECAST_RELAY_PASSWORD=changeme"
  "COTURN_PASSWORD=changeme"
  "ICECAST_PASS=changeme"
  "JWT_SECRET="
  "ROOM_TTL_MS=0"
  "LLM_BASE_URL=http://localhost:1234/v1"
  "LLM_MODEL=qwen3.5-35b"
)

# Ensure .env exists and has every required key. Missing keys get dev defaults
# appended; existing keys (even if empty) are left untouched.
ensure_env_complete() {
  if [ ! -f .env ]; then
    if [ -f .env.example ]; then
      cp .env.example .env
    else
      touch .env
    fi
  fi

  local added=0
  for pair in "${REQUIRED_DEV_VARS[@]}"; do
    local key="${pair%%=*}"
    if ! grep -q "^${key}=" .env; then
      if [ "$added" -eq 0 ]; then
        printf "\n# Auto-added by dev.sh — dev defaults, override before deploying anywhere shared\n" >> .env
      fi
      echo "${pair}" >> .env
      added=$((added + 1))
    fi
  done
}

# Load environment variables (auto-bootstraps missing keys with dev defaults)
load_env() {
  ensure_env_complete

  # Source .env safely: handles values with spaces, quotes, and "#" inside strings.
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a

  DEV_MODE=${DEV_MODE:-local}
}

# Ensure server/node_modules exists. Without this, archiver and ws are missing
# and the signaling server crashes at import.
ensure_server_deps() {
  if [ ! -d server/node_modules ]; then
    echo "📦 server/node_modules missing — running npm install..."
    (cd server && npm install --silent)
    echo ""
  fi
}

# Quick preflight for the chosen mode
preflight() {
  local mode="$1"
  if [ "$mode" = "docker" ] || [ "$mode" = "local" ]; then
    if ! command -v docker >/dev/null 2>&1; then
      echo "❌ docker not on PATH. Install Docker Desktop or set DEV_MODE=local-only."
      exit 1
    fi
    if ! docker info >/dev/null 2>&1; then
      echo "❌ Docker daemon not running. Start Docker Desktop and try again."
      exit 1
    fi
  fi
  if [ "$mode" = "local" ] || [ "$mode" = "docker" ]; then
    if ! command -v ffmpeg >/dev/null 2>&1; then
      echo "⚠️  ffmpeg not on PATH. Audio cleaning, MP3 export, and transcription will fail."
      echo "   Install: brew install ffmpeg  (macOS)  |  apt install ffmpeg  (Debian/Ubuntu)"
      echo ""
    fi
  fi
}

# Start services
start_services() {
  load_env
  preflight "$DEV_MODE"
  ensure_server_deps

  echo "🚀 OpenStudio Development Mode: $DEV_MODE"
  echo ""

  if [ "$DEV_MODE" = "local" ]; then
    echo "📦 Bringing up Icecast + coturn (Docker)..."
    docker compose up -d icecast coturn
    # Stop the dockerized signaling if it's running — we're about to run it on host
    docker compose stop signaling >/dev/null 2>&1 || true

    echo ""
    echo "🔧 Starting local signaling server (port ${PORT:-6736})..."
    echo "   Hot reload enabled via node --watch — edit files in server/"
    echo "   Press Ctrl+C to stop"
    echo ""
    cd server && npm run dev

  elif [ "$DEV_MODE" = "docker" ]; then
    echo "📦 Starting all services in Docker..."
    docker compose up -d

    echo ""
    echo "✅ Services started:"
    docker compose ps
    echo ""

    echo "📋 Quick commands:"
    echo "   View logs:       ./dev.sh logs"
    echo "   Check status:    ./dev.sh status"
    echo "   Restart:         ./dev.sh restart"
    echo "   Rebuild signal:  ./dev.sh rebuild"
    echo "   Stop:            ./dev.sh stop"
    echo ""
    echo "ℹ️  Code in server/ is bind-mounted in dev — restart picks up changes."
    echo "    For dependency changes (package.json), run: ./dev.sh rebuild"

  else
    echo "❌ Unknown DEV_MODE: $DEV_MODE"
    echo "   Valid options: docker, local"
    echo "   Edit .env file to change mode"
    exit 1
  fi
}

# Stop services
stop_services() {
  load_env
  echo "🛑 Stopping OpenStudio services..."
  echo ""

  if [ "$DEV_MODE" = "local" ]; then
    echo "⚠️  Local mode: signaling runs in foreground (use Ctrl+C in that terminal)"
    echo "📦 Stopping Docker services (Icecast, coturn)..."
    docker compose stop
  else
    docker compose stop
  fi

  echo ""
  echo "✅ Services stopped"
  docker compose ps
}

# Restart services
restart_services() {
  load_env
  ensure_server_deps
  echo "🔄 Restarting OpenStudio services..."
  echo ""

  if [ "$DEV_MODE" = "local" ]; then
    echo "⚠️  Local mode: Stop signaling (Ctrl+C) and run ./dev.sh start"
    echo "📦 Restarting Docker services (Icecast, coturn)..."
    docker compose restart
    echo ""
    echo "✅ Docker services restarted"
    docker compose ps
  else
    docker compose restart
    echo ""
    echo "✅ Services restarted"
    docker compose ps
  fi
}

# Rebuild the signaling image (needed when package.json or Dockerfile changes)
rebuild_signaling() {
  load_env
  echo "🏗️  Rebuilding signaling image..."
  docker compose build signaling
  echo ""
  if docker compose ps signaling --status running 2>/dev/null | grep -q signaling; then
    echo "🔄 Restarting signaling container with new image..."
    docker compose up -d signaling
  fi
  echo "✅ Signaling image rebuilt"
}

# Show status
show_status() {
  load_env
  echo "📊 OpenStudio Status (Mode: $DEV_MODE)"
  echo ""
  docker compose ps
  echo ""

  if [ "$DEV_MODE" = "local" ]; then
    echo "ℹ️  Signaling server: running locally (check terminal)"
  fi

  echo ""
  echo "🔍 Health checks:"
  echo -n "   Signaling (6736): "
  if curl -s http://localhost:6736/health > /dev/null 2>&1; then
    echo "✅ OK"
  else
    echo "❌ DOWN"
  fi

  echo -n "   Icecast (6737):   "
  if curl -s http://localhost:6737/ > /dev/null 2>&1; then
    echo "✅ OK"
  else
    echo "❌ DOWN"
  fi

  echo -n "   Web UI (6736/):   "
  if curl -s http://localhost:6736/ > /dev/null 2>&1; then
    echo "✅ OK (served by signaling)"
  else
    echo "❌ DOWN"
  fi
}

# Show logs
show_logs() {
  load_env
  SERVICE=${2:-}

  if [ -z "$SERVICE" ]; then
    echo "📋 Showing all service logs (Ctrl+C to exit)..."
    echo ""
    docker compose logs -f
  else
    echo "📋 Showing logs for: $SERVICE (Ctrl+C to exit)..."
    echo ""
    docker compose logs -f "$SERVICE"
  fi
}

# Show usage
show_usage() {
  cat <<EOF
🎙️  OpenStudio Development Server Manager

Usage:
  ./dev.sh [COMMAND] [OPTIONS]

Commands:
  start          Start all services (default)
  stop           Stop all services
  restart        Restart all services
  rebuild        Rebuild the signaling Docker image (when deps change)
  status         Show service status and health checks
  logs [service] Show logs (all services or specific: signaling, icecast, coturn)
  help           Show this help message

Examples:
  ./dev.sh                  # Start services (same as './dev.sh start')
  ./dev.sh stop             # Stop all services
  ./dev.sh restart          # Restart all services
  ./dev.sh rebuild          # Rebuild signaling image after deps change
  ./dev.sh status           # Check if services are running
  ./dev.sh logs             # Follow all logs
  ./dev.sh logs signaling   # Follow signaling server logs only

Configuration:
  .env controls development mode and service credentials.
  Missing keys are auto-filled with dev defaults on first run.
  Default mode is 'local' — signaling runs on host with hot reload via
  node --watch; Icecast + coturn run in Docker. Use ./dev-switch.sh to
  toggle to docker mode (everything in containers).

EOF
}

# Main command handler
case "$COMMAND" in
  start)
    start_services
    ;;
  stop)
    stop_services
    ;;
  restart)
    restart_services
    ;;
  rebuild)
    rebuild_signaling
    ;;
  status)
    show_status
    ;;
  logs)
    show_logs "$@"
    ;;
  help|--help|-h)
    show_usage
    ;;
  *)
    echo "❌ Unknown command: $COMMAND"
    echo ""
    show_usage
    exit 1
    ;;
esac
