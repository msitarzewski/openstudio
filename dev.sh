#!/bin/bash
set -e

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
else
  echo "⚠️  No .env file found. Creating from .env.example..."
  cp .env.example .env
  export $(cat .env | grep -v '^#' | xargs)
fi

# Default to docker mode if not set
DEV_MODE=${DEV_MODE:-docker}

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

  echo "📋 View logs:"
  echo "   All services:  docker compose logs -f"
  echo "   Signaling:     docker compose logs -f signaling"
  echo "   Icecast:       docker compose logs -f icecast"
  echo ""

  echo "🔄 Rebuild signaling after code changes:"
  echo "   docker compose up --build -d signaling"
  echo ""

  read -p "Follow signaling logs now? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker compose logs -f signaling
  fi

else
  echo "❌ Unknown DEV_MODE: $DEV_MODE"
  echo "   Valid options: docker, local"
  echo "   Edit .env file to change mode"
  exit 1
fi
