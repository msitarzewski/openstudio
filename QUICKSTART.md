# OpenStudio Quick Start

## First Time Setup (5 minutes)

```bash
git clone https://github.com/msitarzewski/openstudio.git
cd openstudio
cp .env.example .env
cd server && npm install && cd ..
cd web && npm install && cd ..
cp station-manifest.sample.json station-manifest.json
```

## Daily Development Workflow

### Start Services
```bash
./dev.sh start        # Start all services
cd web && python3 -m http.server 8086  # In another terminal
```

Open browser: **http://localhost:8086**

### Server Management Cheat Sheet

| Command | Description |
|---------|-------------|
| `./dev.sh start` | Start all services (default) |
| `./dev.sh stop` | Stop all services |
| `./dev.sh restart` | Restart after code changes |
| `./dev.sh status` | Check health + service status |
| `./dev.sh logs` | Follow all logs (Ctrl+C to exit) |
| `./dev.sh logs signaling` | Follow signaling server logs only |
| `./dev.sh help` | Show all commands |

### Common Tasks

**After making code changes**:
```bash
./dev.sh restart
./dev.sh logs signaling  # Verify no errors
```

**Check if everything is running**:
```bash
./dev.sh status
# Should show:
#   ✅ Signaling (6736): OK
#   ✅ Icecast (6737): OK
#   ✅ Web UI (8086): OK
```

**Debug connection issues**:
```bash
./dev.sh logs           # See all service logs
./dev.sh status         # Check health endpoints
```

### Troubleshooting

**Microphone not working (macOS)**:
1. System Settings → Sound → Input → Verify correct mic selected
2. Check input level meter bounces when speaking
3. Browser address bar → Click 🎙️ → Check device selection
4. **Safari users**: Level meter may appear black initially (starts working when you speak)
5. **Try different browser**: Brave/Chrome recommended for development

**Port already in use**:
```bash
./dev.sh stop           # Stop all services
lsof -i :6736          # See what's using port 6736
```

**Services not responding**:
```bash
./dev.sh restart       # Try restart first
./dev.sh status        # Check health
./dev.sh logs          # Check for errors
```

## Development Modes

Edit `.env` to switch:

**Docker mode** (default):
```bash
DEV_MODE=docker
```
- All services in Docker
- Production parity
- Best for: testing, integration

**Local mode**:
```bash
DEV_MODE=local
```
- Signaling runs locally with hot reload
- Icecast/coturn in Docker
- Best for: backend development

Switch interactively: `./dev-switch.sh`

## Testing

```bash
# Run automated test suite
./run-pre-validation.sh

# Tests:
# - WebRTC connections (2-peer)
# - Audio graph routing
# - Gain controls
# - Program bus mixing
# - Mix-minus calculation
# - Return feed routing (bidirectional)
```

## Key URLs

- **Web UI**: http://localhost:8086
- **Signaling**: ws://localhost:6736
- **Icecast**: http://localhost:6737
- **Stream**: http://localhost:6737/live.opus

## Quick Tips

- **Visual mic check**: Look for green level meter in your participant card
- **Join as second user**: Copy room URL from browser address bar
- **Stop everything**: `./dev.sh stop`
- **Fresh start**: `./dev.sh restart`

---

**Need help?** See full docs in `README.md` or run `./dev.sh help`
