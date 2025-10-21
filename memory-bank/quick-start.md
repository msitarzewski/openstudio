# Quick Start Guide

## Common Development Patterns

### Starting a Development Session

1. **Load Current Context**
   ```bash
   # Read active context
   cat memory-bank/activeContext.md

   # Check recent tasks
   cat memory-bank/tasks/2025-10/README.md
   ```

2. **Verify Infrastructure**
   ```bash
   # Check Docker services (should already be running)
   docker compose ps

   # View logs if needed
   docker compose logs icecast
   docker compose logs coturn
   ```

3. **Check Current Branch** (when git initialized)
   ```bash
   git status
   git log -1
   ```

### Development Modes

OpenStudio supports two development workflows configured via `.env` file:

**Docker Mode** (default):
```bash
# In .env
DEV_MODE=docker

# Start all services
./dev.sh
# OR manually:
docker compose up -d
```

**Local Mode** (hot reload):
```bash
# In .env
DEV_MODE=local

# Start local dev server
./dev.sh
# OR manually:
docker compose stop signaling
cd server && npm run dev
```

**Switch between modes**:
```bash
./dev-switch.sh
```

### Common Commands

**Universal Development Script**:
```bash
# Start development environment (reads .env for mode)
./dev.sh

# Switch development mode interactively
./dev-switch.sh
```

**Docker Management** (manual):
```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# Stop only signaling (for local mode)
docker compose stop signaling

# View logs
docker compose logs -f signaling
docker compose logs -f icecast

# Rebuild signaling after code changes
docker compose up --build -d signaling
```

**Local Development** (manual):
```bash
# Signaling server with hot reload (in server/)
npm run dev

# Web client static server (in web/)
python3 -m http.server 8086
```

**Testing WebRTC**:
- Open Chrome: `chrome://webrtc-internals/`
- Open Firefox: `about:webrtc`

### Quick Reference: File Locations

**Memory Bank**:
- Core files: `/memory-bank/*.md`
- Tasks: `/memory-bank/tasks/YYYY-MM/`
- This guide: `/memory-bank/quick-start.md`

**Code** (when created):
- Signaling server: `/server/`
- Web studio: `/web/`
- Shared types: `/shared/`

**Infrastructure**:
- Docker config: `/docker-compose.yml`
- Station config: `/station-manifest.json`

### Common Issues & Solutions

**Issue**: Docker services not starting
**Solution**:
```bash
docker compose down -v
docker compose up -d
```

**Issue**: WebRTC connection fails (when implemented)
**Solution**:
- Check TURN/STUN configuration in station-manifest.json
- Verify HTTPS is enabled (required for getUserMedia)
- Check browser console for ICE candidate errors

**Issue**: Audio not flowing (when implemented)
**Solution**:
- Open `chrome://webrtc-internals/` and check RTCPeerConnection stats
- Verify microphone permissions granted
- Check Web Audio graph in browser debugger

### Session Data Structure

**Station Manifest** (`station-manifest.json`):
```json
{
  "stationId": "unique-id",
  "name": "Station Name",
  "signaling": {
    "url": "ws://localhost:6736"
  },
  "ice": {
    "stun": ["stun:localhost:3478"],
    "turn": [{
      "urls": "turn:localhost:3478",
      "username": "user",
      "credential": "pass"
    }]
  }
}
```

**Room Token Payload** (JWT, when auth implemented):
```json
{
  "roomId": "room-uuid",
  "userId": "user-uuid",
  "role": "host|caller",
  "exp": 1234567890
}
```

### WebRTC Connection Flow (Reference)

1. **Signaling Phase**:
   - Host creates room → receives room token
   - Caller joins room → exchanges SDP via signaling
   - ICE candidates exchanged

2. **Connection Phase**:
   - Browser attempts direct connection (STUN)
   - Falls back to TURN relay if needed
   - DTLS-SRTP encryption negotiated

3. **Media Phase**:
   - Audio tracks flow peer-to-peer
   - Web Audio graph processes streams
   - Program bus sent to Icecast

### Performance Benchmarks (Target)

| Metric | Target | Acceptable | Unacceptable |
|--------|--------|------------|--------------|
| Mute latency | <150ms | 150-300ms | >300ms |
| Join latency | <3s | 3-5s | >5s |
| Session stability | 60+ min | 30-60 min | <30 min |
| CPU usage (host) | <30% | 30-50% | >50% |
| Memory (10 peers) | <500MB | 500-800MB | >800MB |

### Git Commit Template

```
<type>: <subject>

<optional body>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types**: feat, fix, docs, refactor, test, chore

### Helpful Resources

- **WebRTC Docs**: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
- **Web Audio API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- **Icecast Docs**: https://icecast.org/docs/
- **coturn Docs**: https://github.com/coturn/coturn/wiki

### Environment Setup Checklist

- [ ] Node.js 18+ installed
- [ ] Docker + Docker Compose installed
- [ ] Git installed
- [ ] Modern browser (Chrome/Firefox recommended)
- [ ] mkcert installed (for local HTTPS, optional)
- [ ] Station manifest copied and configured
- [ ] Docker services started (`docker compose up -d`)

### Development Workflow

1. **Plan**: Review Memory Bank, create todos
2. **Implement**: Write code following projectRules.md
3. **Test**: Manual testing (WebRTC requires real browsers)
4. **Document**: Update Memory Bank if architectural changes
5. **Commit**: Follow git commit template

### Debugging Tools

**Browser DevTools**:
- Console: Error messages, logs
- Network: WebSocket frames, HTTP requests
- Sources: Breakpoints, step debugging
- Performance: CPU/memory profiling

**WebRTC Specific**:
- Chrome: `chrome://webrtc-internals/`
- Firefox: `about:webrtc`
- Shows ICE candidates, connection state, audio levels

**Docker Logs**:
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f icecast
```

### Code Snippets (Future Reference)

**Create WebRTC Peer Connection**:
```javascript
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:localhost:3478' },
    {
      urls: 'turn:localhost:3478',
      username: 'user',
      credential: 'pass'
    }
  ]
});

pc.onicecandidate = (event) => {
  if (event.candidate) {
    signaling.send({ type: 'ice', candidate: event.candidate });
  }
};

pc.ontrack = (event) => {
  // Handle incoming audio track
  audioGraph.addSource(peerId, event.track);
};
```

**Web Audio Graph Setup**:
```javascript
const audioContext = new AudioContext();
const source = audioContext.createMediaStreamSource(stream);
const gain = audioContext.createGain();
const compressor = audioContext.createDynamicsCompressor();

source.connect(gain);
gain.connect(compressor);
compressor.connect(audioContext.destination);

// Mute
gain.gain.value = 0;

// Unmute
gain.gain.value = 1;
```

**WebSocket Signaling**:
```javascript
const ws = new WebSocket('wss://localhost:8080');

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'join', roomId: 'abc123' }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  handleSignalingMessage(message);
};
```

---

**Last Updated**: 2025-10-16
