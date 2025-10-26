# OpenStudio

**Own your voice. Control your broadcast. No platform required.**

OpenStudio is a self-hosted, open-source virtual broadcast studio that puts power back in the hands of creators. Run live call-in shows, multi-host podcasts, and community radio—all from infrastructure you control.

---

## The Problem

Today's broadcast tools force impossible choices:

- **SaaS Lock-in**: StreamYard, Riverside, Zoom own your content and charge recurring fees
- **Privacy Invasion**: Commercial platforms track users and control access
- **Censorship Risk**: Centralized services can deplatform you without warning
- **Technical Barriers**: Building custom WebRTC infrastructure is prohibitively complex

**There has to be a better way.**

---

## The OpenStudio Vision

A world where anyone can broadcast professionally without asking permission or paying gatekeepers.

### Core Principles

🔓 **Zero Commercial Lock-in**
MIT/BSD/GPL dependencies only. No proprietary SDKs, no SaaS requirements, no vendor control.

🌐 **Distributed by Design**
DHT-based station directory. No central registry, no single point of failure, no censorship vector.

🎛️ **Broadcast-Quality Audio**
Mix-minus per caller (no echo), per-participant gain controls, professional routing—all in the browser.

⚡ **5-Minute Setup**
`git clone && docker compose up` gets you live. Self-hosting shouldn't require a PhD.

🧩 **Composable Architecture**
Extend with plugins, integrate with existing tools, own your entire stack.

---

## What You Get

### For Station Owners

- **Complete Infrastructure Control**: Run on your hardware, your network, your rules
- **Zero Recurring Costs**: No subscriptions beyond your hosting expenses
- **Censorship Resistance**: Can't be deplatformed—you own the platform
- **Privacy First**: No tracking, no data collection, no third-party analytics

### For Hosts & Producers

- **Professional Mixing**: Web Audio API-powered routing with per-participant controls
- **Mix-Minus Technology**: Callers never hear themselves (prevents echo/feedback)
- **Instant Mute/Unmute**: <150ms latency from button press to audio change
- **Multi-Host Support**: Collaborate seamlessly with co-hosts across the internet

### For Callers & Guests

- **Simple Join**: Click a link, grant mic permission, you're live—no account required
- **Crystal Clear Audio**: No echo, no feedback, no weird delays
- **Privacy Preserved**: Not tracked, not profiled, not monetized
- **Browser Native**: Works in Brave, Chrome, Firefox—no downloads needed (Safari supported with limitations)

### For Developers

- **Clean Architecture**: Peer-to-peer media, centralized signaling, documented patterns
- **Minimal Dependencies**: Audited libraries only, no framework bloat
- **Extensible Design**: Plugin system, webhooks, REST/WebSocket APIs (roadmap)
- **Active Community**: Join us in building the future of independent broadcasting

---

## Use Cases

### Live Call-in Podcast
Host and co-host discuss topics, take questions from web callers, stream to audience via Icecast, record for later distribution.

### Community Radio Station
Multiple shows with different hosts, distributed station directory for discoverability, volunteer moderators, 24/7 streaming capability.

### Educational Webinar
Professor + TAs as hosts, students call in with questions, controlled audio mixing, private deployment on university infrastructure.

### Live Interview Show
Host interviews remote guest, audience calls in with questions, producer manages levels, streams to multiple platforms simultaneously.

---

## Quick Start

### Prerequisites

- Node.js 18+
- Docker + Docker Compose
- Modern browser (Brave, Chrome, or Firefox recommended; Safari has stricter permissions)
- 5 minutes

### First Time Setup

```bash
# Clone the repository
git clone https://github.com/msitarzewski/openstudio.git
cd openstudio

# Create your local configuration
cp .env.example .env

# Install dependencies
cd server && npm install && cd ..
cd web && npm install && cd ..

# Configure your station (optional - has sensible defaults)
cp station-manifest.sample.json station-manifest.json
```

### Start Development Environment

```bash
# Start all services (Docker mode - recommended)
./dev.sh start

# In another terminal, start the web client
cd web && python3 -m http.server 8086

# Open browser to http://localhost:8086
# Start broadcasting! 🎙️
```

That's it. You're now running a professional broadcast studio on your own infrastructure.

### Server Management

The `./dev.sh` script provides simple commands for managing OpenStudio services:

```bash
# Start all services (default command)
./dev.sh start
./dev.sh          # same as 'start'

# Stop all services
./dev.sh stop

# Restart all services (after code changes)
./dev.sh restart

# Check service status and health
./dev.sh status

# View logs
./dev.sh logs              # All services
./dev.sh logs signaling    # Signaling server only
./dev.sh logs icecast      # Icecast server only

# Get help
./dev.sh help
```

**Quick restart workflow after code changes**:
```bash
./dev.sh restart           # Restart all services
./dev.sh logs signaling    # Watch logs to verify
```

### Development Modes

OpenStudio supports two development workflows configured via `.env` file:

**Docker Mode** (default, recommended for most users):
- All services run in Docker containers
- Production parity (same as deployment)
- Best for: Testing, integration work, deployment validation

**Local Mode** (for core development):
- Signaling server runs locally with hot reload
- Icecast and coturn remain in Docker
- Faster iteration (automatic restart on file changes)
- Best for: Backend development, debugging, rapid prototyping

**Switch between modes**:
```bash
./dev-switch.sh   # Interactive mode switcher
# OR edit .env file manually and change DEV_MODE
```

### Troubleshooting

**Port 6736 already in use**:
```bash
# Check what's using the port
lsof -i :6736  # macOS/Linux
netstat -ano | findstr :6736  # Windows

# Stop OpenStudio services
./dev.sh stop
```

**Services not starting**:
```bash
# Check service status
./dev.sh status

# View logs to diagnose
./dev.sh logs

# Try restarting
./dev.sh restart

# If still having issues, check Docker directly
docker compose ps
docker compose logs
```

**Microphone not working** (macOS):
```bash
# 1. Check System Settings → Sound → Input
#    - Verify correct microphone is selected
#    - Verify input level shows activity when speaking

# 2. Check browser permissions
#    - Click microphone icon in address bar
#    - Ensure correct device is selected

# 3. Safari-specific issues
#    - Safari has WebAudio quirks (see docs/SAFARI_WEBAUDIO_QUIRKS.md)
#    - Level meters work but may appear blank initially
#    - Recommended: Use Brave/Chrome for development

# 4. Restart browser and try again
```

---

## Architecture

OpenStudio uses a hybrid architecture: **peer-to-peer media, centralized signaling**.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Host A     │────▶│   Signaling  │◀────│   Host B     │
│  (Browser)   │     │    Server    │     │  (Browser)   │
└──────────────┘     └──────────────┘     └──────────────┘
       │                                          │
       │            WebRTC (peer-to-peer)         │
       └──────────────────────────────────────────┘
                         │
                    Web Audio Graph
              (Mix-Minus + Program Bus)
                         │
                         ▼
                   Icecast Server
                         │
                         ▼
                  📻 Live Stream
```

**Key Components:**

- **Signaling Server** (Node.js + WebSocket): Coordinates WebRTC connections
- **TURN/STUN Server** (coturn): NAT traversal assistance
- **Web Studio Client** (Vanilla JS): Browser-based mixing and control
- **Icecast Server**: Streams program audio to listeners
- **DHT Directory** (coming in v0.2): Distributed station discovery

### The Mix-Minus Magic

The secret sauce: each caller gets a personalized audio mix that excludes their own voice.

```
Program Bus = Host A + Host B + Caller 1 + Caller 2

Caller 1 hears: Host A + Host B + Caller 2  (Program - Caller 1)
Caller 2 hears: Host A + Host B + Caller 1  (Program - Caller 2)

Result: No echo, no feedback, professional broadcast quality
```

---

## Roadmap

### ✅ Release 0.1 — MVP (In Progress)
**Goal**: Functional multi-host studio with Icecast output

- WebRTC signaling server
- Web Audio graph with mix-minus
- Per-participant mute/unmute
- Program bus → Icecast (OGG/Opus)
- Docker-based deployment
- **Target**: 60+ minute stable sessions, <150ms mute latency

### 🔜 Release 0.2 — Distributed Stations (+2 months)
**Goal**: No central registry, censorship-resistant discovery

- WebTorrent DHT or libp2p integration
- Ed25519 keypair generation for station identities
- Signed station manifests
- Decentralized station discovery queries

### 📋 Release 0.3 — Call-in System (+3 months)
**Goal**: Professional call screening and management

- Waiting room UI
- Host admits/rejects callers before going live
- Per-caller gain sliders
- Optional text chat

### 🎯 Release 0.4 — Extended Features (+3 months)
**Goal**: Production-ready feature set

- Multi-track recording (local files)
- Soundboard/jingle playback
- Remote moderator roles
- Relay servers for redundancy

### 🚀 Release 0.5 — Federation & APIs (+4 months)
**Goal**: Ecosystem integration

- REST/WebSocket API for external control
- Cross-station guest appearances
- Matrix bridge for chat integration
- Webhooks for events

---

## Technology Stack

**Signaling & Backend:**
- Node.js (ES modules)
- WebSocket (`ws` library)
- JWT authentication
- Ed25519 cryptography (`@noble/ed25519`)

**Frontend:**
- Vanilla JavaScript (ES modules)
- Web Audio API
- WebRTC API
- MediaRecorder API

**Infrastructure:**
- Icecast (streaming)
- coturn (STUN/TURN)
- Docker Compose (deployment)

**Future Additions:**
- WebTorrent DHT or libp2p (station directory)
- Optional: React/Vue/Svelte (if UI complexity demands)

### Why These Choices?

- **Zero Commercial Dependencies**: Every library is open-source (MIT/BSD/GPL)
- **Self-Hosting First**: No CDN requirements, no SaaS services, no third-party analytics
- **Minimal Surface Area**: Fewer dependencies = fewer vulnerabilities = easier to audit
- **Browser Native**: Leverage platform APIs instead of heavy frameworks

---

## Contributing

OpenStudio is in active development. We need:

- **Backend Engineers**: Help build the signaling server and room management
- **Frontend Developers**: Create beautiful, accessible UI for the web studio
- **WebRTC Specialists**: Optimize peer connections and audio routing
- **Documentation Writers**: Make self-hosting accessible to everyone
- **Community Moderators**: Help new users get started
- **Translators**: Make OpenStudio accessible worldwide

### Getting Started

1. Read the [Memory Bank documentation](./memory-bank/toc.md) to understand project architecture
2. Check [activeContext.md](./memory-bank/activeContext.md) for current priorities
3. Review [projectRules.md](./memory-bank/projectRules.md) for coding standards
4. Look at [open issues](https://github.com/msitarzewski/openstudio/issues) for tasks
5. Join our community (Discord/Matrix link coming soon)

### Development Workflow

We use a multi-agent approach inspired by real development teams:

- **Planning Agent**: Analyzes requirements and creates implementation strategy
- **Development Agent**: Implements code following project patterns
- **QA Agent**: Reviews for compliance, functionality, and standards
- **Iterative Collaboration**: Specialists work together until code meets all requirements

See [CLAUDE.md](./.claude/CLAUDE.md) for detailed workflow instructions.

---

## Philosophy

### Why Open Source?

Closed platforms can:
- Raise prices arbitrarily
- Change terms of service unilaterally
- Shut down without warning
- Censor content they disagree with
- Sell your data to third parties

**Open source prevents all of this.**

### Why Self-Hosting?

When you run OpenStudio:
- You control the infrastructure
- You own the data
- You set the rules
- You cannot be deplatformed
- You pay only for your hosting costs

**Self-hosting is digital sovereignty.**

### Why Distributed?

Centralized directories are:
- Single points of failure
- Censorship vectors
- Honeypots for surveillance
- Targets for legal pressure

**Distribution is resilience.**

---

## Project Status

**Current Phase**: Release 0.1 MVP — Initialization
**Code Status**: 0% implemented (documentation complete, ready for development)
**Infrastructure**: Docker Compose configuration ready
**Documentation**: Comprehensive Memory Bank system initialized

### What's Working

✅ Complete architectural documentation
✅ Docker infrastructure defined
✅ Development workflow established
✅ Memory Bank system initialized
✅ Clear roadmap through v0.5

### What's Next

🚧 Signaling server skeleton
🚧 Web studio HTML scaffold
🚧 First WebRTC peer connection test

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Setup Time | < 5 min | TBD |
| Mute Latency | < 150ms | TBD |
| Session Stability | 60+ min | TBD |
| Join Latency | < 3s | TBD |
| Max Participants | 10-15 | TBD |
| CPU Usage (host) | < 30% | TBD |
| Memory (10 peers) | < 500MB | TBD |

---

## Security & Privacy

### Cryptographic Standards

- Ed25519 for station keypairs (modern, fast, secure)
- JWT with HMAC-SHA256 for room tokens
- DTLS 1.2+ for WebRTC media (browser-enforced)

### Privacy Commitments

- No user tracking or analytics by default
- No third-party cookies or beacons
- No telemetry without explicit opt-in
- Optional self-hosted analytics (Plausible, Matomo)

### Threat Model

**Protected Against:**
- Unauthorized room access (mitigated by tokens)
- Station impersonation (mitigated by signed manifests)
- Man-in-the-middle on media (mitigated by DTLS-SRTP)

**Future Work:**
- DoS protection (rate limiting in v0.2+)
- DHT pollution resistance (signing + reputation in v0.2+)

---

## Support

### Documentation

- **[Quick Start Guide](./memory-bank/quick-start.md)**: Get up and running fast
- **[Architecture Docs](./memory-bank/ARCHITECTURE.md)**: System design and data flow
- **[Signal Flow](./memory-bank/SIGNAL_FLOW.md)**: Audio routing and mix-minus implementation
- **[Project Rules](./memory-bank/projectRules.md)**: Coding standards and patterns

### Getting Help

- GitHub Issues: Bug reports and feature requests
- Discussions: Questions and community support
- Discord/Matrix: Real-time chat (coming soon)

### Sponsorship

OpenStudio is a labor of love, but infrastructure costs money. If you benefit from this project, consider sponsoring:

- GitHub Sponsors (link coming soon)
- Open Collective (link coming soon)

Sponsorship funds:
- Development time for core maintainers
- Infrastructure for testing and demos
- Security audits
- Documentation improvements

---

## License

OpenStudio is released under the [MIT License](./LICENSE).

**Why MIT?**
- Maximum freedom for users
- Compatible with commercial use
- Encourages ecosystem growth
- Aligns with open-source philosophy

**You are free to:**
- Use commercially
- Modify freely
- Distribute widely
- Sublicense as needed

**All we ask:**
- Preserve copyright notice
- Keep license text in redistributions

---

## Acknowledgments

Built with inspiration from:

- **Jitsi Meet**: Pioneering open-source video conferencing
- **BigBlueButton**: Educational web conferencing done right
- **Mastodon**: Proving decentralized social platforms work
- **Matrix**: Federation and open protocols for communication
- **IPFS**: Demonstrating the power of distributed systems

Special thanks to the WebRTC community, Web Audio API developers, and everyone building the decentralized web.

---

## Join the Movement

Broadcasting shouldn't require permission from platforms.
Privacy shouldn't be a premium feature.
Censorship shouldn't be built into the infrastructure.

**OpenStudio is how we build the alternative.**

⭐ Star this repo to follow development
🔔 Watch for updates and releases
🤝 Contribute code, docs, or ideas
📢 Spread the word to fellow creators

**Together, we're taking back the airwaves.**

---

<div align="center">

**[Documentation](./memory-bank/toc.md)** • **[Roadmap](#roadmap)** • **[Contributing](#contributing)** • **[Support](#support)**

Made with ❤️ by the open-source community

</div>
