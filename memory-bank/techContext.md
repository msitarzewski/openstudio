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
**UI**: HTML/CSS initially, avoid framework dependencies in MVP

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

**Goal**: `git clone && docker compose up` gets you live

**Requirements**:
- Single Docker Compose file for all services
- Sensible defaults in sample config
- Optional advanced configuration

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

**Out of Scope (MVP)**:
- DoS attacks on signaling server (rate limiting in 0.2+)
- DHT pollution (signing + reputation in 0.2+)
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

### Development Workflow

1. Clone repository
2. Copy `station-manifest.sample.json` → `station-manifest.json`
3. `docker compose up -d` (starts Icecast + coturn + signaling)
4. `cd server && npm install && npm run dev` (signaling server)
5. `cd web && npm install && npm run dev` (web studio, if using bundler)
6. Open `https://localhost:3000` (or similar)

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

### Release 0.2 (Distributed Stations)

- Implement DHT directory (WebTorrent or libp2p)
- Ed25519 keypair generation and management
- Signed station manifests

### Release 0.3 (Call-in System)

- Waiting room UI
- Screen caller before admitting to program
- Per-caller gain controls
- Text chat (optional)

### Release 0.4 (Extended Features)

- Multi-track recording (local, not streamed)
- Jingle/soundboard playback
- Remote moderation (delegate control to trusted users)

### Release 0.5 (Federation & APIs)

- REST/WebSocket API for external control
- Cross-station linking (guest appearances)
- Matrix bridge for text chat integration

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
