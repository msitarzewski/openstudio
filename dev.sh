#!/bin/bash
set -e

# OpenStudio Development Server Manager
# Usage: ./dev.sh [start|stop|restart|status|logs]

COMMAND=${1:-start}

# Load environment variables
load_env() {
  if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
  else
    echo "⚠️  No .env file found. Creating from .env.example..."
    cp .env.example .env
    export $(cat .env | grep -v '^#' | xargs)
  fi
  DEV_MODE=${DEV_MODE:-docker}
}

# Start services
start_services() {
  load_env
  echo "🚀 OpenStudio Development Mode: $DEV_MODE"
  echo ""

  if [ "$DEV_MODE" = "local" ]; then
    echo "📦 Stopping Docker signaling container..."
    docker compose stop signaling

    echo ""
    echo "✅ Docker services status:"
    docker compose ps
    echo ""

    echo "🔧 Starting local signaling server (port ${LOCAL_SIGNALING_PORT:-6736})..."
    echo "   Hot reload enabled - edit files in server/"
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
    echo "   View logs:     ./dev.sh logs"
    echo "   Check status:  ./dev.sh status"
    echo "   Restart:       ./dev.sh restart"
    echo "   Stop:          ./dev.sh stop"
    echo ""

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
    echo "⚠️  Local mode: signaling runs in foreground (use Ctrl+C)"
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

  echo -n "   Icecast (6737):    "
  if curl -s http://localhost:6737/ > /dev/null 2>&1; then
    echo "✅ OK"
  else
    echo "❌ DOWN"
  fi

  echo -n "   Web UI (8086):     "
  if curl -s http://localhost:8086/ > /dev/null 2>&1; then
    echo "✅ OK"
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
  status         Show service status and health checks
  logs [service] Show logs (all services or specific: signaling, icecast, coturn)
  help           Show this help message

Examples:
  ./dev.sh                  # Start services (same as './dev.sh start')
  ./dev.sh stop             # Stop all services
  ./dev.sh restart          # Restart all services
  ./dev.sh status           # Check if services are running
  ./dev.sh logs             # Follow all logs
  ./dev.sh logs signaling   # Follow signaling server logs only

Configuration:
  Edit .env file to change development mode (docker/local)

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
