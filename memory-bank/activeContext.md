# Active Context: OpenStudio

**Last Updated**: 2026-03-13 (Release 0.2.1 Security Hardening — In Progress)

## Current Phase

**Release**: 0.2.1 (Security Hardening)
**Branch**: `release/0.2.1-security-hardening`
**Status**: Implementation in progress (changes staged, not yet committed)
**Focus**: Server-side security hardening, JWT auth, rate limiting, CORS, input validation
**Next**: Commit, test, merge to main

## Recent Decisions

### 2026-03-13: v0.2.1 — JWT Room & Invite Tokens

**Decision**: Add JWT-based authentication for room access and invite links.

**Rationale**:
- Room tokens prove peerId + roomId + role (prevents spoofing)
- Invite tokens allow authenticated role assignment via shareable URLs
- Only host/ops can generate invite tokens (prevents privilege escalation)
- ICE credentials (including TURN) delivered via WebSocket on room join, not via public `/api/station` API

**Implementation**:
- `server/lib/auth.js` — NEW: `generateRoomToken()`, `generateInviteToken()`, `verifyToken()`
- JWT_SECRET from env var or auto-generated random (logged as warning)
- Room tokens expire in 24h, invite tokens in 4h
- `create-or-join-room` handler verifies invite tokens and enforces server-side role assignment
- `request-invite` handler: host/ops only, generates signed invite token
- Client `SignalingClient` stores `roomToken` from server responses

### 2026-03-13: v0.2.1 — WebSocket Rate Limiting & Connection Limits

**Decision**: Add per-connection rate limiting and per-IP connection caps.

**Rationale**: Prevent DoS and resource exhaustion on signaling server.

**Implementation**:
- Sliding window rate limiter: 100 signaling messages / 10s, 500 stream-chunk messages / 10s
- Per-IP connection limit: max 10 concurrent WebSocket connections
- `maxPayload: 256KB` on WebSocket server (prevents memory bombs)
- Close code 4008 for connection limit exceeded

### 2026-03-13: v0.2.1 — HTTP Security Headers & CORS Allowlist

**Decision**: Set security headers on every HTTP response and add configurable CORS origin allowlist.

**Implementation**:
- `X-Content-Type-Options: nosniff` (all responses + static files)
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `ALLOWED_ORIGINS` env var: comma-separated allowlist; empty = allow all (dev mode)
- CORS applied to `/api/station` and Icecast listener proxy responses

### 2026-03-13: v0.2.1 — Icecast Proxy & Entrypoint Hardening

**Decision**: Sanitize Icecast listener proxy paths and validate credentials at container startup.

**Implementation**:
- Mount path sanitization: `path.posix.normalize()`, block `..` traversal, block `/admin`
- 403 Forbidden for invalid paths
- `icecast/entrypoint.sh`: fail-fast if `ICECAST_SOURCE_PASSWORD`, `ICECAST_ADMIN_PASSWORD`, or `ICECAST_RELAY_PASSWORD` unset
- Production docker-compose binds Icecast to `127.0.0.1:6737` (not exposed to public)

### 2026-03-13: v0.2.1 — Role-Based Access Control

**Decision**: Enforce role-based permissions server-side for privileged operations.

**Implementation**:
- Streaming: only host/ops can `start-stream`
- Invite generation: only host/ops can `request-invite`
- Mute authority: producer mute on others requires host/ops role
- Joining existing room without invite token forces `guest` role
- Valid roles: `host`, `ops`, `guest` (validated server-side)

### 2026-03-13: v0.2.1 — ICE Config Delivery via Signaling

**Decision**: Deliver ICE configuration (including TURN credentials) via WebSocket `room-created`/`room-joined` messages instead of the public `/api/station` endpoint.

**Rationale**: TURN credentials should not be publicly accessible; only authenticated room participants should receive them.

**Implementation**:
- `server/server.js`: `setIceConfig()` passes ICE config to WebSocket server
- `server/lib/websocket-server.js`: includes `ice` field in `room-created`/`room-joined` responses
- `/api/station` no longer includes `ice` field
- Client `RTCManager.setIceServers()` applies ICE config from signaling; `initialize()` falls back to API fetch if needed

## Current Working Context

### Architecture (v0.2.1)

```
Client (browser) ──────────────── Node.js Server (port 6736)
  │                                  ├─ /health
  │                                  ├─ /api/station (no ICE creds)
  ├─ WebSocket (signaling) ──────────├─ WebSocket (ws, 256KB max, rate limited)
  │   ├─ register → registered       │   ├─ JWT room token on join/create
  │   ├─ create-or-join-room ────────│   ├─ ICE config (incl TURN) in response
  │   ├─ request-invite ─────────────│   ├─ Invite token generation (host/ops)
  │   └─ mute (RBAC enforced) ──────│   └─ Per-IP conn limit (10)
  ├─ Static files ───────────────────├─ /web/* (X-Content-Type-Options, nosniff)
  ├─ Stream listener ────────────────├─ /stream/* → Icecast:6737 (path sanitized)
  │                                  ├─ Security headers (X-Frame-Options, etc.)
  │                                  ├─ CORS allowlist (ALLOWED_ORIGINS)
  │                                  └─ 404
  ├─ WebRTC mesh (peer-to-peer)
  ├─ Web Audio (mix-minus + program bus)
  ├─ MediaRecorder (recording)
  └─ Fetch/WS → Icecast (streaming, host/ops only)
```

### Key Files Modified in v0.2.1

| File | Change |
|------|--------|
| `server/lib/auth.js` | NEW — JWT room tokens + invite tokens |
| `server/server.js` | Security headers, CORS allowlist, ICE config passthrough |
| `server/lib/websocket-server.js` | Rate limiting, connection limits, JWT integration, RBAC, invite flow |
| `server/lib/message-validator.js` | UUID v4 validation for peerId |
| `server/lib/static-server.js` | X-Content-Type-Options header |
| `server/lib/icecast-listener-proxy.js` | Path sanitization, CORS, client disconnect cleanup |
| `server/lib/icecast-proxy.js` | No functional change (already existed) |
| `server/Dockerfile` | Non-root user, healthcheck |
| `icecast/entrypoint.sh` | Credential validation (fail-fast) |
| `docker-compose.yml` | No security-specific changes |
| `deploy/docker-compose.prod.yml` | Icecast bound to 127.0.0.1 |
| `deploy/station-manifest.production.json` | TURN creds marked CHANGE_ME |
| `station-manifest.sample.json` | TURN creds marked CHANGE_ME |
| `.env.example` | JWT_SECRET, ROOM_TTL_MS |
| `web/js/signaling-client.js` | roomToken storage, invite token flow, requestInviteToken() |
| `web/js/rtc-manager.js` | setIceServers() from signaling, fallback API fetch |
| `web/js/icecast-streamer.js` | Dynamic host from location.hostname |
| `web/js/main.js` | ICE from signaling, role-based UI, debug globals localhost-only |
| `server/test-signaling.js` | UUID v4 peer IDs in tests |
| `server/test-rooms.js` | UUID v4 peer IDs in tests |

## Blockers & Risks

### Security Hardening
- JWT_SECRET must be set in production (auto-generated secrets don't survive restarts)
- ALLOWED_ORIGINS should be configured for production deployment
- TURN credentials in station-manifest need real values before deploy
- Invite token flow needs E2E testing with real browser sessions

### Deployment
- Need SSH access to production server for `deploy/setup.sh`
- Caddy must be pre-installed on server
- DNS for openstudio.zerologic.com must point to server

### Recording
- Browser memory limits for long recordings (~500MB estimated for 30min × 4 participants)
- Safari WebM support varies — may need audio/mp4 fallback testing
- WAV export memory-intensive (entire recording decoded at once)
