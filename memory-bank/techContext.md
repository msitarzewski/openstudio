# Technical Context: OpenStudio

## Technology Stack

### Signaling Server

**Primary**: Node.js
**WebSocket Library**: `ws` (minimal, well-tested)
**Authentication**: JWT tokens, `jsonwebtoken` library
**Crypto**: `@noble/ed25519` for keypairs (zero-dependency, audited)

**Constraints**:
- Keep dependencies minimal (security surface)
- Avoid frameworks (Express, etc.) initially
- Pure WebSocket, no Socket.io (too heavy)

### Web Studio Client

**Core**: Vanilla JavaScript (ES modules)
**APIs**: Web Audio API, WebRTC API, MediaRecorder API
**UI**: HTML/CSS with "Signal" design system (no framework dependencies)
**Fonts**: Self-hosted variable woff2 in `web/fonts/` (latin subset) — Space Grotesk (display), Inter (body), JetBrains Mono (data); served by static-server with `font/woff2` MIME

**Future Considerations**:
- React/Vue/Svelte if UI complexity grows
- Web Components for reusability
- State management library if needed

**Browser Support**:
- Chrome/Edge (primary development target)
- Firefox (secondary)
- Safari (known WebRTC quirks, test carefully)

### Post-Production Tools (Power Move — Added ~2026-05)

**Whisper.cpp**: Git submodule for on-device speech transcription (no cloud API, privacy-preserving)
**ffmpeg**: Audio processing — noise reduction, loudness normalization, silence/filler splice detection
**Audio Pipeline**: Upload → Transcribe → Clean → Export (WAV)
- `server/lib/whisper-transcriber.js` — Whisper.cpp integration
- `server/lib/audio-cleaner.js` — Cleaning pipeline (noise reduction, loudness normalization)
- `server/lib/filler-detector.js` — Silence/fill-word detection for splice points
- `server/lib/audio-converter.js` — Format conversion (WebM/OGG → WAV via ffmpeg)

### Media Infrastructure

**TURN/STUN**: coturn
**Streaming**: Icecast (OGG/Opus output)
**Codec**: Opus (best audio quality/bandwidth trade-off)

**Deployment**: Docker Compose (dev and prod)

**Docker Infrastructure**:
- **Icecast**: Custom Alpine-based Dockerfile (multi-platform: ARM64 + x86_64)
- **coturn**: Official image `coturn/coturn` (multi-platform)
- **Signaling**: Custom Node.js 18 Alpine image (multi-platform)
- **Base Images**: Alpine Linux ecosystem for consistency and minimal footprint
- **Platform Support**: macOS ARM64, macOS x86_64, Linux x86_64, Linux ARM64
- **Security**: All containers run as non-root users

### Port Configuration

**Production Services**:
- **Signaling Server**: Port 6736 (customizable, avoids common dev tool conflicts)
- **Icecast HTTP**: Port 6737 (customizable, mapped from container port 8000)
- **coturn STUN/TURN**: Port 3478 (IETF RFC 5389/5766 standard, **do not change**)
- **Relay Ports**: 49152-49200 (ephemeral range, coturn managed)

**Development Services** (v0.2 — single-server, no separate web server needed):
- **Web Client**: Served by Node.js signaling server on port 6736 (static file serving built in)
- **Legacy**: Port 8086 (Python http.server) no longer needed

### Distributed Directory (Release 0.2+)

**Options Under Consideration**:
- WebTorrent DHT (JavaScript-native, proven)
- libp2p (more features, steeper learning curve)

**Requirements**:
- No central server dependency
- Resistant to takedown
- Reasonable query performance

### Development Tools

**Package Manager**: npm
**Build Tools**: None initially (ES modules in browser)
**Linting**: ESLint with standard config
**Testing**: Puppeteer/Playwright for E2E, custom Node.js test suite

## Technical Constraints

### Zero Commercial Dependencies

**Rule**: All dependencies must be open-source (MIT, BSD, Apache, GPL)

**Prohibited**:
- Proprietary SDKs (Twilio, Agora, etc.)
- SaaS-only services (Auth0, AWS-only features)
- Closed-source libraries

**Enforcement**:
- Dependency audit in CI
- Manual review of new additions

### Self-Hosting First

**Rule**: Everything must run on user-controlled infrastructure

**Implications**:
- No CDN dependencies for critical paths (as of v0.3.0, fonts are self-hosted woff2 in `web/fonts/`)
- No third-party analytics by default
- Graceful degradation if external services unavailable

### Minimal Install Complexity

**Goal**: `git clone && npm install && npm start` gets you live (v0.2 achievement)

**Requirements**:
- Single Node.js process serves everything (static files, API, WebSocket, Icecast proxy)
- Auto-copies `station-manifest.sample.json` on first run
- Docker only needed for Icecast + coturn (optional for basic testing)

### Browser Security Model

**Constraints**:
- HTTPS required for WebRTC (getUserMedia)
- CORS policies for signaling server
- Secure contexts only (no localhost exceptions in prod)

**Development Workarounds**:
- Self-signed certs for local dev
- mkcert for trusted local certificates

## Performance Targets

### Latency

- Mute action → audio change: <150ms
- Caller joins → audio flows: <3s (including ICE)
- Signaling round-trip: <100ms (LAN), <300ms (WAN)

### Session Stability

- Zero audio dropouts in 60min session (happy path)
- Automatic reconnection within 10s on transient network failures
- Graceful degradation on TURN-only path

### Resource Usage (per host browser)

- CPU: <30% on modern laptop (audio mixing + encoding)
- Memory: <500MB for 10-participant session
- Bandwidth: ~100kbps per peer connection (Opus @ 48kbps + overhead)

### Icecast Output

- Bitrate: 128kbps Opus (high quality)
- Latency: <5s glass-to-glass (host → listener)
- Concurrent listeners: Limited by Icecast server capacity

## Security Requirements

### Cryptographic Standards

- Ed25519 for station keypairs (modern, fast, secure)
- JWT with HMAC-SHA256 for room tokens
- DTLS 1.2+ for WebRTC media (browser-enforced)

### Threat Model

**In Scope**:
- Unauthorized room access → JWT tokens (mitigated in v0.2.1)
- Station impersonation → signed manifests
- Man-in-the-middle on media → DTLS-SRTP

**Mitigated in v0.2.1**:
- DoS on signaling → rate limiting + per-IP connection cap (10)
- TURN credential exposure → WebSocket-only delivery
- Icecast admin access → proxy path sanitization, /admin blocked
- Clickjacking → X-Frame-Options: DENY
- MIME sniffing → X-Content-Type-Options: nosniff

### Privacy

- No user tracking or analytics by default
- Optional self-hosted analytics (Plausible, Matomo)

## Development Environment

### Required Tools

- Node.js 18+ (LTS)
- Docker + Docker Compose
- ffmpeg (audio processing for Power Move cleaning pipeline)
- whisper.cpp submodule (`git submodule update --init`)

### Optional Tools

- mkcert (for local HTTPS)
- Wireshark (for debugging RTC media issues)

### Development Workflow

1. Clone repository (includes whisper.cpp submodule)
2. `git submodule update --init` (fetches whisper.cpp)
3. `npm install` (installs server deps + ffmpeg/whisper integrated into pipeline)
4. `npm start` → studio at http://localhost:6736

### Testing Strategy

**Unit Tests**: Core logic (audio graph, room state)
**Integration Tests**: Signaling flows, RTC negotiation
**Manual E2E**: Full session with multiple browsers (critical for MVP)
**Automated E2E**: Puppeteer/Playwright in CI (post-MVP)

## Known Technical Challenges

### WebRTC Browser Differences

- Safari: Requires user gesture for getUserMedia
- Firefox: ICE handling quirks

**Mitigation**: Progressive enhancement, test matrix

### TURN Costs at Scale

- TURN relays bandwidth (expensive)
- Encourage users to self-host coturn, document port forwarding

### Mix-Minus Complexity

- Computationally expensive per-caller mixes
- Scales O(N²) with participants
- Limit participant count (10-15 practical), optimize Web Audio graph

## Future Technical Directions

### Release 0.2 ✅ (Single Server + Recording — Shipped 2026-03-13)

### Release 0.2.1 ✅ (Security Hardening — Merged PR #1, 2026-03-14)

### Signal UX Redesign ✅ (Merged PR #7, 2026-03-14)

### Power Move ✅ (Merged PR #8, ~2026-05)

- Whisper.cpp transcription pipeline (whisper.cpp submodule, on-device)
- Audio cleaning engine: noise reduction + loudness normalization
- Filler/silence detection for splice points (ffmpeg-based)
- Clean/Raw export modes in recording deck

### Release 0.3 (Discovery — Planned)

- DHT station discovery (WebTorrent or libp2p)
- Nostr NIP-53 integration
- Ed25519 keypair generation for station identities

### Release 0.4 (Scale — Planned)

- SFU for larger rooms (25+ participants)
- Soundboard/jingle playback
- Text chat
