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
**Fonts**: Google Fonts CDN — Space Grotesk (display), Inter (body), JetBrains Mono (data)

**Future Considerations**:
- React/Vue/Svelte if UI complexity grows
- Web Components for reusability
- State management library if needed

**Browser Support**:
- Chrome/Edge (primary development target)
- Firefox (secondary)
- Safari (known WebRTC quirks, test carefully)

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

**Port Selection Rationale**:
- 6736+ range unlikely to conflict with common development tools
- Avoided 3000 (React/Express/Next.js), 8000 (Django/Jupyter/Python servers)
- Protocol-standard ports (3478) preserved for WebRTC compatibility
- Sequential numbering (6736, 6737) easy to remember

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
**Testing**: TBD (Jest or Mocha + Chai)

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
- No CDN dependencies for critical paths
- No third-party analytics by default
- Graceful degradation if external services unavailable

### Minimal Install Complexity

**Goal**: `git clone && npm install && npm start` gets you live (v0.2 achievement)

**Requirements**:
- Single Node.js process serves everything (static files, API, WebSocket, Icecast proxy)
- Auto-copies `station-manifest.sample.json` on first run
- Docker only needed for Icecast + coturn (optional for basic testing)
- Sensible defaults in sample config

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
- Concurrent listeners: Limited by Icecast server capacity (not a client concern)

## Security Requirements

### Cryptographic Standards

- Ed25519 for station keypairs (modern, fast, secure)
- JWT with HMAC-SHA256 for room tokens
- DTLS 1.2+ for WebRTC media (browser-enforced)

### Threat Model

**In Scope**:
- Unauthorized room access (mitigated by tokens)
- Station impersonation (mitigated by signed manifests)
- Man-in-the-middle on media (mitigated by DTLS-SRTP)

**Mitigated in v0.2.1**:
- DoS on signaling server → rate limiting (100 msg/10s) + per-IP connection cap (10) + maxPayload 256KB
- Unauthorized room access → JWT room tokens (24h) + invite tokens (4h)
- Privilege escalation → server-side role validation (host/ops/guest)
- TURN credential exposure → ICE config via authenticated WebSocket only
- Icecast admin access → proxy path sanitization, /admin blocked
- Clickjacking → X-Frame-Options: DENY
- MIME sniffing → X-Content-Type-Options: nosniff
- Credential defaults → entrypoint.sh fail-fast validation

**Out of Scope (Current)**:
- DHT pollution (signing + reputation in 0.3+)
- Social engineering (user education, not technical solution)

### Privacy

- No user tracking or analytics by default
- Optional self-hosted analytics (Plausible, Matomo)
- No third-party cookies or beacons
- No telemetry without explicit opt-in

## Development Environment

### Required Tools

- Node.js 18+ (LTS)
- Docker + Docker Compose
- Modern browser (Chrome/Firefox)
- Git
- Text editor / IDE

### Optional Tools

- mkcert (for local HTTPS)
- Wireshark (for debugging RTC media issues)
- Chrome DevTools → about:webrtc (essential for WebRTC debugging)

### Development Workflow (v0.2)

1. Clone repository
2. `npm install` (installs server deps automatically)
3. `npm start` → studio at http://localhost:6736
4. `npm run dev` → same with `--watch` hot reload
5. Optional: `docker compose up -d` for Icecast + coturn
6. `npm test` → runs server test suite

### Testing Strategy

**Unit Tests**: Core logic (audio graph, room state)
**Integration Tests**: Signaling flows, RTC negotiation
**Manual E2E**: Full session with multiple browsers (critical for MVP)
**Automated E2E**: Puppeteer/Playwright in CI (post-MVP)

## Known Technical Challenges

### WebRTC Browser Differences

- Safari: Requires user gesture for getUserMedia
- Firefox: ICE handling quirks
- Mobile browsers: Background tab suspension

**Mitigation**: Progressive enhancement, test matrix, clear browser support policy

### TURN Costs at Scale

- TURN relays bandwidth (expensive if many users behind restrictive NATs)

**Mitigation**: Encourage users to self-host coturn, document port forwarding, consider SFU for large events

### Time Synchronization

- Recording multi-track audio requires clock sync
- Browser timestamps can drift

**Mitigation**: Use NTP, accept small skew (<50ms), post-processing alignment in recording feature (0.4+)

### Mix-Minus Complexity

- Computationally expensive to generate per-caller mixes
- Scales O(N²) with participants

**Mitigation**: Limit participant count (10-15 practical), optimize Web Audio graph, consider SFU for large sessions

## Future Technical Directions

### Release 0.2 ✅ (Single Server + Recording — Shipped 2026-03-13)

- Single-server architecture (static serving, Icecast proxy, all on one port)
- Multi-track client-side recording (per-participant + program mix)
- WAV export via OfflineAudioContext
- Deployment config (Caddy, systemd, Docker Compose)
- Room TTL for demo servers
- README repositioned for conversion
- GitHub Codespaces, CI improvements, templates

### Release 0.2.1 🔒 (Security Hardening — In Progress 2026-03-13)

- JWT room + invite token authentication
- WebSocket rate limiting + per-IP connection caps
- HTTP security headers + CORS allowlist
- Role-based access control (host/ops/guest)
- ICE credential protection (WebSocket-only delivery)
- Icecast proxy path sanitization + credential validation
- Docker non-root user, input validation (UUID v4)

### Signal UX Redesign (v0.3-dev — Implemented 2026-03-14)

- "Signal" design system: void/signal/data color palette, atmospheric effects
- Three-font typography: Space Grotesk, Inter, JetBrains Mono (Google Fonts CDN)
- Segmented LED meters (canvas), waveform oscilloscope (canvas)
- CSS-driven broadcast state (`body.broadcasting` class)
- Collapsible deck panels, channel strip cards, speaking detection
- All E2E tests passing

### Release 0.3 (Discovery — Planned)

- DHT station discovery (WebTorrent or libp2p)
- Nostr NIP-53 integration
- Ed25519 keypair generation for station identities

### Release 0.4 (Scale — Planned)

- SFU for larger rooms (25+ participants)
- Soundboard/jingle playback
- Text chat

## Dependency Philosophy

**Prefer**:
- Audited, minimal libraries
- Pure JavaScript (avoid native bindings if possible)
- Standard APIs over polyfills
- Direct usage over abstraction layers

**Avoid**:
- Large frameworks for small gains
- Unmaintained packages
- Dependencies with transitive dependency bloat
- "Magic" libraries that obscure behavior

**Review Process**:
- Check npm audit
- Review GitHub activity and issue tracker
- Verify license compatibility
- Consider maintenance burden
