# Active Context: OpenStudio

**Last Updated**: 2026-03-13 (Release 0.2.0 Complete)

## Current Phase

**Release**: 0.2.0 (Single Server + Recording)
**Status**: Implementation complete (5/5 phases)
**Focus**: Deployment + manual verification
**Next**: Deploy to openstudio.zerologic.com, end-to-end recording test

## Recent Decisions

### 2026-03-13: v0.2.0 Architecture — Single Server with Static Serving

**Decision**: Embed static file serving and Icecast listener proxy directly in the Node.js signaling server, eliminating the need for a separate web server (Python http.server).

**Rationale**:
- `git clone && npm start` gets you a working studio at localhost:6736
- One process, one port, one terminal — dramatically reduced DX friction
- Icecast listener proxy at `/stream/*` keeps everything on one port (critical for Caddy deployment)
- Dynamic client URLs (`location.host`, `location.origin`) work for any deployment

**Implementation**:
- `server/lib/static-server.js` — MIME map, `fs.createReadStream`, traversal prevention
- `server/lib/icecast-listener-proxy.js` — Proxies GET `/stream/*` to localhost:6737
- Request handler order: health → API → proxy → static → 404
- Auto-config: copies `station-manifest.sample.json` on first run

### 2026-03-13: Client-Side Multi-Track Recording

**Decision**: Implement recording entirely client-side using MediaRecorder API, no new server dependencies.

**Rationale**:
- Zero server cost for recording (all in browser)
- Per-participant isolation via MediaStreamDestination tap points on gain nodes
- Same pattern as existing StreamEncoder (audio/webm;codecs=opus)
- Safari fallback: audio/mp4 if webm unavailable

**Implementation**:
- `RecordingManager` — manages per-participant + program recorders
- `WavEncoder` — client-side WebM→WAV via OfflineAudioContext.decodeAudioData()
- Recording tap in AudioGraph: `gain → recordingDestination` (parallel to main chain)
- `recording-state` signaling message broadcasts to all peers (red indicator)

### 2026-03-13: README Conversion Optimization

**Decision**: Replace 584-line manifesto README with 122-line conversion-optimized version. Preserve full vision in `docs/vision.md`.

**Key conversion elements**:
- Comparison table (OpenStudio vs Riverside/Zencastr/StreamYard)
- 3-line quick start (`git clone && npm install && npm start`)
- ASCII architecture diagram
- Live demo link (openstudio.zerologic.com)

### 2026-03-13: Room TTL for Demo Server

**Decision**: Add configurable room expiry via `ROOM_TTL_MS` environment variable (default: no expiry).

**Rationale**: Demo server at openstudio.zerologic.com needs rooms to auto-expire (15 minutes) to prevent resource accumulation.

**Implementation**: 60-second interval checks room creation times, broadcasts `room-expired`, cleans up.

## Current Working Context

### Architecture (v0.2.0)

```
Client (browser) ──────────────── Node.js Server (port 6736)
  │                                  ├─ /health
  │                                  ├─ /api/station
  ├─ WebSocket (signaling) ──────────├─ WebSocket (ws)
  ├─ Static files ───────────────────├─ /web/* (static)
  ├─ Stream listener ────────────────├─ /stream/* → Icecast:6737
  │                                  └─ 404
  ├─ WebRTC mesh (peer-to-peer)
  ├─ Web Audio (mix-minus + program bus)
  ├─ MediaRecorder (recording)
  └─ Fetch/WS → Icecast (streaming)
```

### Key Files Modified in v0.2.0

| File | Change |
|------|--------|
| `server/server.js` | Added static + proxy imports and routes |
| `server/lib/static-server.js` | NEW — serves web/ directory |
| `server/lib/icecast-listener-proxy.js` | NEW — /stream/* proxy |
| `server/lib/config-loader.js` | Auto-copy sample config |
| `server/lib/room-manager.js` | Room TTL support |
| `server/lib/websocket-server.js` | recording-state handler |
| `web/js/signaling-client.js` | Dynamic WS URL, recording-state event |
| `web/js/rtc-manager.js` | Dynamic API URL |
| `web/js/icecast-streamer.js` | Dynamic host |
| `web/js/audio-graph.js` | Recording tap points |
| `web/js/recording-manager.js` | NEW — multi-track recording |
| `web/js/wav-encoder.js` | NEW — WebM→WAV converter |
| `web/js/main.js` | Recording integration |
| `web/index.html` | Recording UI, dynamic stream URL |
| `web/css/studio.css` | Recording styles |
| `package.json` | v0.2.0, scripts, metadata |
| `README.md` | Conversion-optimized rewrite |
| `docs/vision.md` | Original README preserved |
| `deploy/*` | Caddyfile, docker-compose, systemd, setup script |
| `.devcontainer/*` | Codespaces support |
| `.github/*` | CI update, issue/PR templates |

## Blockers & Risks

### Deployment
- Need SSH access to production server for `deploy/setup.sh`
- Caddy must be pre-installed on server
- DNS for openstudio.zerologic.com must point to server

### Recording
- Browser memory limits for long recordings (~500MB estimated for 30min × 4 participants)
- Safari WebM support varies — may need audio/mp4 fallback testing
- WAV export memory-intensive (entire recording decoded at once)
