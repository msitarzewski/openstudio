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
MediaStreamSource → GainNode → DynamicsCompressor → ChannelMerger → Destination
                                                    ↓
                                              ProgramBus / MixMinusBus
```

### 3. Mix-Minus per Caller

**Pattern**: Create individualized audio mixes for each caller that exclude their own voice

**Rationale**:
- Prevents self-echo/feedback
- Standard broadcast technique
- Essential for caller experience quality

**Implementation**:
- Program Bus = sum of all participants
- MixMinus_i = Program - participant_i
- Route MixMinus_i back to caller i via dedicated RTC track

### 4. Producer-Authoritative Control

**Pattern**: Host/producer has final authority over mute states and routing

**Rationale**:
- Prevents caller disruption
- Standard broadcast control model
- Simplified conflict resolution

**Rules**:
- Producer can mute any participant
- Self-mute is local but reported to producer
- Producer state wins on conflicts (last-write-wins)

### 5. Distributed Station Directory

**Pattern**: DHT/libp2p for station discovery, no central registry

**Rationale**:
- Censorship resistance
- No single point of failure
- Scales without central infrastructure
- Aligned with self-hosting philosophy

**Implementation** (planned for 0.2):
- Ed25519 keypairs for station identity
- Signed manifests published to DHT
- Stations self-announce availability
- Clients query DHT for discovery

## Component Structure

### Signaling Server

**Responsibilities**:
- WebSocket connection management
- SDP offer/answer coordination
- ICE candidate relay
- Room state management
- Authentication token validation

**Tech**: Node.js, WebSocket library, minimal dependencies

### Web Studio Client

**Responsibilities**:
- User interface for hosts/producers
- Web Audio graph construction
- RTC peer management
- Local audio mixing
- Program output encoding

**Tech**: Vanilla JS (initially), Web Audio API, WebRTC API

### TURN/STUN Server

**Responsibilities**:
- NAT traversal assistance
- Media relay fallback

**Tech**: coturn (Docker container)

### Streaming Output

**Responsibilities**:
- Receive encoded program audio
- Distribute to listeners
- Standard mount point access

**Tech**: Icecast (Docker container)

## Data Flow Patterns

### Session Initialization

1. Host connects to signaling server
2. Creates room, receives room token
3. Shares invite URL with participants
4. Participants connect, exchange SDP via signaling
5. ICE negotiation establishes peer connections
6. Audio tracks flow, Web Audio graph routes signals

### Audio Mixing Flow

1. Remote tracks arrive via RTC
2. Each track → MediaStreamAudioSourceNode
3. Gain + compression applied per-participant
4. All sources sum to Program Bus
5. Program Bus → MediaRecorder → Icecast
6. Mix-minus calculated per-caller
7. Mix-minus sent back via dedicated RTC tracks

### Control Messages

- Mute/unmute: Signaling propagates to all peers
- Gain adjustment: Local only (no signaling needed)
- Room membership: Signaling broadcasts join/leave events

## Security Patterns

### Station Authentication

- Ed25519 keypair per station
- Station manifest signed by private key
- Public key published to directory
- Clients verify signatures before connecting

### Room Access Control (Updated v0.2.1)

- JWT room tokens prove peerId + roomId + role (24h expiry)
- JWT invite tokens for link sharing (4h expiry, host/ops generate)
- Server-side role validation (host, ops, guest)
- No invite token + existing room → forced guest role
- ICE credentials (TURN) only in authenticated WebSocket messages

### Media Security

- DTLS-SRTP on all RTC connections
- No unencrypted media transport
- Browser enforces secure contexts (HTTPS required)

### Input Validation (v0.2.1)

- UUID v4 regex validation for peerId on register
- Message type validation before processing
- From-field spoofing prevention (must match registered peerId)
- Icecast proxy path sanitization (posix.normalize, block traversal, block /admin)
- WebSocket maxPayload: 256KB

### Rate Limiting (v0.2.1)

- Per-connection sliding window: 100 signaling / 10s, 500 stream-chunk / 10s
- Per-IP connection cap: 10 concurrent WebSockets
- Icecast entrypoint: fail-fast credential validation

### 6. Single-Server Architecture (v0.2)

**Pattern**: One Node.js process serves static files, API, WebSocket signaling, and Icecast listener proxy — all on one port.

**Rationale**:
- `git clone && npm start` → working studio (zero DX friction)
- One port simplifies reverse proxy deployment (Caddy just does `reverse_proxy localhost:6736`)
- Dynamic client URLs (`location.host`, `location.origin`) work for any deployment

**Request handler order**:
```
/health          → health check
/api/station     → ICE config
/stream/*        → Icecast listener proxy (localhost:6737)
static files     → serve from web/ directory
404              → fallback
```

### 7. Client-Side Multi-Track Recording (v0.2)

**Pattern**: MediaRecorder on per-participant MediaStreamDestination tap points, all client-side.

**Rationale**:
- Zero server cost (recording happens in browser)
- Per-participant isolation (tap at gain node, before compressor)
- Same encoding as streaming (audio/webm;codecs=opus)

**Implementation**:
```
Participant: Source → Gain → [recordingDestination] → Analyser → Compressor → Program Bus
                              ↓
                     MediaRecorder (per-track)

Program Bus → MediaStreamDestination → MediaRecorder (mix)
```

### 8. Room TTL for Demo Servers (v0.2)

**Pattern**: Configurable room expiry via environment variable, 60-second sweep interval.

**Implementation**:
- `ROOM_TTL_MS` env var (default: 0 = no expiry)
- `roomCreationTimes` map tracks when rooms were created
- `setInterval` every 60s broadcasts `room-expired` and cleans up

### 9. JWT Authentication & Invite Tokens (v0.2.1)

**Pattern**: JWT-based room tokens prove identity/role; invite tokens enable authenticated link sharing.

**Implementation**:
- `server/lib/auth.js`: `generateRoomToken(peerId, roomId, role)` → 24h JWT
- `generateInviteToken(roomId, role)` → 4h JWT (host/ops only)
- `verifyToken(token)` → `{ valid, payload?, error? }`
- JWT_SECRET from env or auto-generated random (dev warning logged)
- Room creation/join returns token + ICE config via WebSocket
- Invite tokens embedded in URL, verified server-side on join

### 10. WebSocket Rate Limiting & Connection Caps (v0.2.1)

**Pattern**: Sliding-window rate limiter per connection, per-IP connection cap.

**Implementation**:
- 100 signaling messages / 10s window, 500 stream-chunk / 10s
- Max 10 connections per IP (`connectionsByIp` map)
- `maxPayload: 256KB` on WebSocket server
- Rate limit exceeded → error message; connection limit → close with 4008

### 11. HTTP Security Headers (v0.2.1)

**Pattern**: Defence-in-depth headers on every HTTP response.

**Headers**:
- `X-Content-Type-Options: nosniff` (all responses including static files)
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- CORS: `ALLOWED_ORIGINS` env var (comma-separated allowlist; empty = allow all)

### 12. Role-Based Access Control (v0.2.1)

**Pattern**: Server-side enforcement of role permissions for privileged operations.

**Roles**: `host`, `ops`, `guest` (validated server-side)

**Permissions**:
- `start-stream`: host/ops only
- `request-invite`: host/ops only
- Producer mute on others: host/ops only
- Self-mute: any role
- Joining without invite token: forced to `guest` role

### 13. ICE Credential Protection (v0.2.1)

**Pattern**: TURN credentials delivered via authenticated WebSocket, not public API.

**Implementation**:
- `/api/station` returns station info without ICE credentials
- ICE config (including TURN username/credential) included in `room-created`/`room-joined` WebSocket messages
- Client `RTCManager.setIceServers()` applies config from signaling response
- Fallback: `initialize()` fetches from API if signaling didn't provide ICE (STUN-only)

### 14. Signal Design System — CSS-Driven Broadcast State (v0.3-dev)

**Pattern**: Single `body.broadcasting` CSS class drives all ON AIR visual state changes.

**Rationale**:
- One class toggle cascades to header, wordmark, cards, vignette, signal bar
- CSS handles transitions/animations — JS only adds/removes the class
- Decouples visual state from application logic

**Implementation**:
- `main.js:handleStartSession()` → `document.body.classList.add('broadcasting')`
- `main.js:handleEndSession()` → `document.body.classList.remove('broadcasting')`
- `studio.css`: `body.broadcasting` selectors for all ON AIR effects
- `body.broadcasting::before` → 2px red signal line at top of viewport

### 15. Segmented LED Meters with Speaking Detection (v0.3-dev)

**Pattern**: VolumeMeter class supports multiple visualization modes and callbacks.

**Implementation**:
```
VolumeMeter(canvas, analyser, { mode: 'meter'|'waveform', onSpeaking: callback })
```
- `meter` mode: Segmented LED bar (32 or 16 segments based on width)
- `waveform` mode: Real-time oscilloscope with glow effect
- `onSpeaking` callback drives `.speaking` class on participant cards
- Amber → red color ramp (not green/yellow/red traffic light)
- Ghost segments at 3% opacity, peak hold with 1.5s decay
- HiDPI setup deferred to `start()` (not constructor) — CSS layout must be stable before reading `getBoundingClientRect()`

### 15a. Local Mic in Program Bus (v0.3-dev)

**Pattern**: Host's local microphone is routed into the program bus so Signal Output reflects the complete broadcast mix.

**Implementation**:
- `createLocalMeter()` connects: `source → analyser → compressor → programBus`
- Compressor settings match remote participant chain for consistent levels
- Program bus already connects to `audioContext.destination`, so no separate Safari workaround needed
- `_localAudioNodes` stored for cleanup on session end

### 16. Collapsible Deck Panels (v0.3-dev)

**Pattern**: Recording and streaming details in collapsible panels, primary controls in transport bar.

**Implementation**:
- `.deck-panel` with `.deck-header` (click to toggle) and `.deck-body`
- `.collapsed` class hides body via `max-height: 0`
- Primary actions (Record, Stream buttons) remain in transport bar
- Deck panels show details: timer, download list, bitrate selector, stream URL
- Start collapsed; auto-expand on recording start

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

- Full session bring-up
- Multi-peer scenarios
- Mute/unmute propagation
- Disconnection handling

### Performance Tests

- Session duration (60+ min stability)
- Mute latency (<150ms)
- Audio quality metrics (no dropouts)
- Resource usage (CPU, memory, bandwidth)
