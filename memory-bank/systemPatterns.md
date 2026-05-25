# System Patterns: OpenStudio

## Architecture Patterns

### 1. Peer-to-Peer Media, Centralized Signaling

**Pattern**: Media flows directly between peers (WebRTC); coordination happens via WebSocket signaling server

**Rationale**:
- Reduces server bandwidth costs (no media relay)
- Minimizes latency for audio
- Simplifies scaling (signaling is lightweight)

**Implementation**:
- Signaling server coordinates SDP exchange
- STUN/TURN (coturn) only for NAT traversal
- Each peer maintains direct RTC connections

### 2. Web Audio Graph for Mixing

**Pattern**: Use Web Audio API nodes for per-participant gain, compression, and routing

**Rationale**:
- Native browser performance
- No server-side processing required
- Real-time parameter adjustment
- Complex routing (mix-minus) possible

**Structure**:
```
[source1] → gain1 → compressor1 ──┐
[source2] → gain2 → compressor2 ──┼→ programBus → destination
[source3] → gain3 → compressor3 ──┘
                                    ↑
                              mixMinusCalculator
```

### 3. Mix-Minus per Caller

**Pattern**: Each caller receives a version of the program bus that excludes their own audio

**Rationale**:
- Prevents echo (hearing yourself) which is critical for call-in shows
- Maintains natural conversation flow
- Standard radio broadcast practice

**Implementation**:
- `AudioGraph` tracks all active sources
- For each caller, creates a custom bus excluding their input source
- Calculated at connection time and maintained dynamically

### 4. Producer-Authoritative Control

**Pattern**: There is no "admin" — the first person to create a room owns it

**Rationale**:
- Simplest access model: whoever shows up first is host
- No permission negotiation needed
- Clear ownership (temporal)

**Implementation**:
- `RoomManager` assigns "Producer" role to room creator
- Creator can invite guests, manage participants
- Producer drops → room dissolves (no fallback admin)

### 5. Distributed Station Directory (Planned — v0.3)

**Pattern**: Peer-to-peer discovery of available stations via DHT/gossip protocol

**Rationale**:
- No central directory = no single point of failure
- Resistant to takedown/censorship
- True distributed network effect

**Design**:
```
Station A ── DHT gossip ──→ Station B → C → D ...
```

**Implementation Plan**:
- Use Redis-compatible DHT or simple gossip protocol
- Announce availability on startup, listen for others
- Discovery via Nostr relay or custom gossip mesh
- Station manifest signed with Ed25519 for authenticity

### 6. Single-Server Architecture (v0.2)

**Pattern**: All services consolidated into a single Node.js process on one port (6736)

**Rationale**:
- Simpler deployment: one process, one port to configure
- No nginx/caddy reverse proxy needed for local use
- Faster startup, fewer failure points

**Implementation**:
- `server/server.js` handles static file serving (from web/ directory)
- WebSocket endpoint at `/ws` for signaling
- API endpoints for health, station info
- Icecast listener proxy at `/stream/*`
- File upload and export endpoints for Power Move

### 7. Client-Side Multi-Track Recording (v0.2)

**Pattern**: Each participant's audio is captured at the client side before mixing, allowing post-production multi-track editing

**Implementation**:
- `MediaStreamDestination` per participant gain node
- Separate MediaRecorder instances for each track + program mix
- WAV encoding client-side via OfflineAudioContext
- Downloadable per-participant tracks + program mix

### 8. Room TTL for Demo Servers (v0.2)

**Pattern**: Rooms auto-expire after configurable idle time to free resources on shared/demo instances

**Implementation**:
- `ROOM_TTL_MS` environment variable (default: not set = no expiry)
- Server checks every 60s for idle rooms
- Broadcasts room deletion before cleanup

### 9. JWT Authentication & Invite Tokens (v0.2.1)

**Pattern**: Room tokens validate hosts; invite tokens allow guests to join with controlled permissions

**Implementation**:
- Hosts receive JWT room token (24h expiry) on create/enter
- Guests use short-lived invite tokens (4h) to join
- Tokens embedded in WebSocket connection and UI state

### 10. WebSocket Rate Limiting & Connection Caps (v0.2.1)

**Pattern**: Per-connection and per-path rate limiting to prevent DoS

**Implementation**:
- 100 messages / 10 seconds per connection (signaling)
- 500 messages / 10 seconds per IP (streaming path)
- Maximum 10 connections per IP
- Max payload size: 256KB

### 11. HTTP Security Headers (v0.2.1)

**Pattern**: Production-grade security headers on all HTTP responses from the Node.js server

- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY (prevent clickjacking)
- Referrer-Policy: strict-origin-when-cross-origin

### 12. Role-Based Access Control (v0.2.1)

**Pattern**: Server-enforced permissions based on JWT role claims

- **Host**: Full control — create rooms, manage participants
- **Ops**: Limited admin — mute guests, view room state
- **Guest**: Basic participation — send/receive audio

### 13. ICE Credential Protection (v0.2.1)

**Pattern**: STUN/TURN credentials delivered only through authenticated WebSocket, never exposed via public API

**Before (v0.2)**: `/api/station` returned ICE config publicly
**After (v0.2.1)**: WebSocket handshake with room token → ICE config in response

### 14. Signal Design System — CSS-Driven Broadcast State (v0.3-dev)

**Pattern**: Use `body.broadcasting` CSS class as the single source of truth for all visual broadcast state changes

**Rationale**:
- One class toggle cascades to all elements (header border, wordmark color, card accents)
- CSS handles transitions/animations — JS only adds/removes the class

### 15. Segmented LED Meters with Speaking Detection (v0.3-dev)

**Pattern**: Hardware-style segmented LED meters that glow when audio is present, with ghost segments for visual realism

**Implementation**:
- Canvas-based rendering at native resolution (HiDPI aware)
- Ghost segments render at reduced opacity for "off" state feel
- Speaking detection via `VolumeMeter` callback triggers card glow animations

### 15a. Local Mic in Program Bus (v0.3-dev)

**Pattern**: Host's local microphone is routed into the program bus so Signal Output reflects the complete broadcast mix

**Implementation**:
- `createLocalMeter()` connects: `source → analyser → compressor → programBus`
- Compressor settings match remote participant chain for consistent levels

### 16. Collapsible Deck Panels (v0.3-dev)

**Pattern**: Recording and streaming details in collapsible panels, primary controls in transport bar.

### 17. File Upload + Audio Cleaning Pipeline (Power Move — ~2026-05)

**Pattern**: Post-production audio pipeline for cleaning and transcribing recordings.

**Flow**: Recording upload → Transcription + Cleaning → Export (Raw or Clean)

**Implementation**:
- `POST /api/upload` — Binary-safe multipart file upload (Buffer parsing)
- `whisper.cpp` submodule — On-device speech-to-text, no cloud dependency
- Audio cleaning pipeline (`audio-cleaner.js`):
  - Noise reduction pass
  - Loudness normalization (EBU R128-style)
  - Filler/silence detection (`filler-detector.js`) for splice points
- ffmpeg integration for audio processing and output encoding (WAV)
- Clean/Raw export modes: raw = original upload, clean = processed audio
- `GET/POST /api/export/clean` and `/api/export/raw` endpoints
- Format conversion: WebM/OGG recording → WAV export via `audio-converter.js`

**UI**: Upload section in HTML, transcript display area, Clean/Raw toggle buttons in deck

## Error Handling Patterns

### Peer Disconnection

- Signaling detects via WebSocket close
- Remove peer from audio graph
- Notify remaining participants
- Optional: Elect new producer if host drops

### TURN-Only Fallback

- Detect high latency path
- Degrade to audio-only (disable video if present)
- Reduce Opus bitrate to improve stability
- UI warns user of degraded mode

### Icecast Outage

- Buffer program audio locally
- Retry connection with exponential backoff
- Optional: Failover to secondary mount point
- Notify producer of streaming status

## Scaling Patterns

### Horizontal Signaling

- Multiple signaling servers possible
- Each manages subset of rooms
- Station manifest points to primary signaling URL
- Directory queries route to correct server

### Media Mesh Limits

- Practical limit: ~10-15 simultaneous participants
- Beyond this, consider SFU (Selective Forwarding Unit)
- Future: Optional SFU mode for large events

## Testing Patterns

### Unit Tests

- Audio graph node construction
- Mix-minus calculation logic
- Room state management
- Token generation/validation

### Integration Tests

- Signaling server message flows
- ICE negotiation sequences
- Audio routing verification
- Icecast output validation

### E2E Tests

- Full session bring-up (Puppeteer/Playwright)
- Multi-peer scenarios with room creation
- Mute/unmute propagation across peers
- Disconnection/reconnection handling

### Performance Tests

- Session duration (60+ min stability)
- Mute latency (<150ms)
- Audio quality metrics (no dropouts)
- Resource usage (CPU, memory, bandwidth)
