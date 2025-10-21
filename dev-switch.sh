#!/bin/bash
set -e

# Load current mode
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
else
  echo "⚠️  No .env file found. Creating from .env.example..."
  cp .env.example .env
  export $(cat .env | grep -v '^#' | xargs)
fi

CURRENT_MODE=${DEV_MODE:-docker}

echo "Current mode: $CURRENT_MODE"
echo ""
echo "Switch to:"
echo "  1) docker  - All services in Docker (recommended)"
echo "  2) local   - Signaling locally, Icecast/coturn in Docker"
echo ""
read -p "Choose mode (1/2): " -n 1 -r
echo

case $REPLY in
  1)
    sed -i.bak 's/^DEV_MODE=.*/DEV_MODE=docker/' .env
    echo "✅ Switched to Docker mode"
    echo "   Run: ./dev.sh"
    ;;
  2)
    sed -i.bak 's/^DEV_MODE=.*/DEV_MODE=local/' .env
    echo "✅ Switched to local mode"
    echo "   Run: ./dev.sh"
    ;;
  *)
    echo "❌ Invalid choice"
    exit 1
    ;;
esac

rm -f .env.bak  # Clean up sed backup
