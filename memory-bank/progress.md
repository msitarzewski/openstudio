# Progress: OpenStudio

**Last Updated**: 2026-03-13 (Release 0.2.0 Implementation Complete)

## What's Working

### Infrastructure

✅ **Release 0.1.0 Complete** (20/20 tasks, shipped 2026-03-12)
- Full WebRTC mesh signaling, Web Audio mix-minus, Icecast streaming
- All automated tests passing (18/18)
- Browser compatibility: Brave, Chrome, Firefox, Safari

✅ **Release 0.2.0 Implementation Complete** (5 phases, shipped 2026-03-13)
- Single-server architecture (one process, one port)
- Multi-track recording (per-participant + program mix)
- README repositioned for conversion
- Deployment configuration for openstudio.zerologic.com
- DX improvements (Codespaces, CI, templates)

### Code — v0.2.0 Changes

✅ **Phase 1: Single-Server Architecture**
- `server/lib/static-server.js` — Serves web/ with MIME types, directory traversal prevention
- `server/lib/icecast-listener-proxy.js` — Proxies GET /stream/* to Icecast on port 6737
- `server/server.js` — Integrated static serving + proxy routes (health → API → proxy → static → 404)
- `web/js/signaling-client.js` — Dynamic WebSocket URL from `location.protocol`/`location.host`
- `web/js/rtc-manager.js` — Dynamic API URL from `location.origin`
- `web/js/icecast-streamer.js` — Dynamic host from `location.hostname`
- `web/index.html` — Stream URL uses `/stream/live.opus` proxy path
- `server/lib/config-loader.js` — Auto-copies sample config on first run
- `package.json` — v0.2.0 with `npm start`, `npm run dev`, `npm test`, `npm install`

✅ **Phase 2: README Repositioning**
- `README.md` — 584 lines → 122 lines, conversion-optimized with comparison table
- `docs/vision.md` — Full original README preserved

✅ **Phase 3: Deployment Configuration**
- `deploy/Caddyfile` — Reverse proxy for openstudio.zerologic.com
- `deploy/docker-compose.prod.yml` — Production Icecast + coturn
- `deploy/openstudio.service` — systemd unit file
- `deploy/station-manifest.production.json` — Production ICE config
- `deploy/setup.sh` — Automated deployment script
- `server/lib/room-manager.js` — Room TTL support (env `ROOM_TTL_MS`, 60s check interval)

✅ **Phase 4: Recording Feature**
- `web/js/recording-manager.js` — Multi-track MediaRecorder with timer, download, auto-format detection
- `web/js/wav-encoder.js` — Client-side WebM→WAV converter via OfflineAudioContext
- `web/js/audio-graph.js` — Recording tap points (MediaStreamDestination per participant gain node)
- `web/index.html` — Recording UI section (record/stop/download, timer, indicator)
- `web/css/studio.css` — Recording styles (pulsing indicator, track download list)
- `web/js/main.js` — Full recording integration (start/stop/download, auto-record new participants, broadcast state)
- `server/lib/websocket-server.js` — `recording-state` broadcast handler
- `web/js/signaling-client.js` — `recording-state` event dispatch

✅ **Phase 5: DX Improvements**
- `.devcontainer/devcontainer.json` — GitHub Codespaces support
- `.github/ISSUE_TEMPLATE/bug_report.yml` — Bug report form
- `.github/ISSUE_TEMPLATE/feature_request.yml` — Feature request form
- `.github/PULL_REQUEST_TEMPLATE.md` — PR template
- `.github/workflows/ci.yml` — Node 18/20/22 matrix, npm caching, removed python http.server

### Verification Results (v0.2.0)

✅ 18/18 server tests passing (signaling: 9/9, rooms: 9/9)
✅ Static file serving: HTML (200), JS (200), CSS (200) with correct MIME types
✅ Directory traversal prevention: `%2e%2e/package.json` → 404
✅ Icecast listener proxy: `/stream/live.opus` → 502 (expected, no Icecast running)
✅ Health endpoint: `/health` → 200
✅ API endpoint: `/api/station` → 200
✅ Auto-config: `station-manifest.json` created from sample on first run
✅ `npm start` serves full studio at `localhost:6736`

### v0.2.1 Security Hardening (In Progress)

**Server-Side**:
✅ `server/lib/auth.js` — JWT room tokens (24h) + invite tokens (4h)
✅ `server/lib/websocket-server.js` — Rate limiting, per-IP connection limits, JWT integration, RBAC
✅ `server/lib/message-validator.js` — UUID v4 validation for peerId
✅ `server/lib/static-server.js` — X-Content-Type-Options: nosniff
✅ `server/lib/icecast-listener-proxy.js` — Path sanitization (traversal + /admin blocked), CORS
✅ `server/server.js` — Security headers, CORS allowlist, ICE config via signaling
✅ `icecast/entrypoint.sh` — Credential validation (fail-fast, no insecure defaults)
✅ `server/Dockerfile` — Non-root user (appuser), healthcheck
✅ `deploy/docker-compose.prod.yml` — Icecast bound to 127.0.0.1

**Client-Side**:
✅ `web/js/signaling-client.js` — roomToken storage, invite token support, requestInviteToken()
✅ `web/js/rtc-manager.js` — setIceServers() from signaling, fallback API fetch
✅ `web/js/main.js` — ICE from signaling, role-based UI, debug globals localhost-only
✅ `web/js/icecast-streamer.js` — Dynamic host

**Tests**:
✅ `server/test-signaling.js` — Updated peer IDs to valid UUID v4
✅ `server/test-rooms.js` — Updated peer IDs to valid UUID v4

**Config**:
✅ `.env.example` — JWT_SECRET, ROOM_TTL_MS
✅ `station-manifest.sample.json` — TURN creds marked CHANGE_ME
✅ `deploy/station-manifest.production.json` — TURN creds marked CHANGE_ME

## What's Next

### Immediate

1. **Commit & test v0.2.1** — Finalize security hardening branch, run full test suite
2. **Deploy to openstudio.zerologic.com** — Run `deploy/setup.sh` on production server with `JWT_SECRET` and `ALLOWED_ORIGINS` set
3. **End-to-end recording test** — Manual test: record, stop, download, verify tracks
4. **Playwright tests update** — Update test URLs from port 8086 to 6736

### Short Term (Next Sprint)

1. **WAV export UI button** — Add "Export WAV" next to each track download
2. **Recording size monitoring** — Show estimated size during recording, warn at 500MB
3. **Room TTL UI feedback** — Show countdown timer for demo rooms
4. **Invite URL UI** — Add "Copy Invite Link" button using invite tokens

### Release 0.3 (Planned)

- DHT station discovery (WebTorrent or libp2p)
- Nostr NIP-53 integration
- Ed25519 keypair generation for station identities

### Release 0.4 (Planned)

- SFU for larger rooms (25+ participants)
- Soundboard/jingle playback
- Text chat

## Release Roadmap

### Release 0.1.0 — MVP ✅ (Shipped 2026-03-12)
**Status**: Complete (20/20 tasks)
- WebRTC mesh signaling, Web Audio mix-minus, per-participant controls
- Icecast streaming, mute controls, role system
- Docker infrastructure, automated tests

### Release 0.2.0 — Single Server + Recording ✅ (Shipped 2026-03-13)
**Status**: Implementation complete (5/5 phases)
- Single-server architecture (`npm start` → working studio)
- Multi-track recording (per-participant + program mix)
- README repositioned for conversion
- Deployment config for openstudio.zerologic.com
- DX: Codespaces, CI matrix, GitHub templates

### Release 0.2.1 — Security Hardening 🔒 (In Progress 2026-03-13)
**Status**: Implementation in progress (branch: `release/0.2.1-security-hardening`)
- JWT room tokens + invite tokens (`server/lib/auth.js`)
- WebSocket rate limiting (100 signaling/10s, 500 stream/10s) + per-IP connection limit (10)
- HTTP security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- CORS origin allowlist (`ALLOWED_ORIGINS` env var)
- Icecast proxy path sanitization (traversal + /admin blocked)
- Role-based access control (streaming, invites, muting)
- ICE credentials moved from public API to authenticated WebSocket flow
- Icecast entrypoint credential validation (fail-fast)
- Docker non-root user, healthcheck
- UUID v4 validation for peer IDs
- Test suite updated for new validation rules

### Release 0.3 — Discovery (Planned)
- DHT station discovery, Nostr NIP-53
- Station identities with Ed25519 keypairs

### Release 0.4 — Scale (Planned)
- SFU for larger rooms
- Soundboard, text chat
