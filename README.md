[![CI](https://github.com/msitarzewski/openstudio/actions/workflows/ci.yml/badge.svg)](https://github.com/msitarzewski/openstudio/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) ![Node 18+](https://img.shields.io/badge/node-18%2B-brightgreen) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/msitarzewski/openstudio/pulls)

# OpenStudio

> Live radio studio in your browser. No accounts. No cloud. 50KB.

[Try the Live Demo](https://openstudio.zerologic.com) · [Report Bug](https://github.com/msitarzewski/openstudio/issues)

---

## Quick Start

```bash
git clone https://github.com/msitarzewski/openstudio.git
cd openstudio && npm install && npm start
# Open http://localhost:6736
```

One command. One process. One port.

## Why OpenStudio?

| | OpenStudio | Riverside | Zencastr | StreamYard |
|---|---|---|---|---|
| **Price** | Free / self-host | $29/mo | $20/mo | $25/mo |
| **Recording** | Per-track WAV + mix | Per-track | Per-track | Mix only |
| **Self-hosted** | Yes | No | No | No |
| **Privacy** | Zero tracking | Cloud-dependent | Cloud-dependent | Cloud-dependent |
| **Max participants** | 15 (mesh) | 8 | 15 | 10 |
| **Setup time** | 30 seconds | Account + payment | Account + payment | Account + payment |
| **Open source** | MIT | No | No | No |

## How It Works

```
┌─────────┐    WebRTC Mesh    ┌─────────┐
│ Host A  │◄────────────────►│ Host B  │
└────┬────┘                   └────┬────┘
     │          ┌─────────┐        │
     └──────────│Signaling│────────┘
                │ Server  │
                └────┬────┘
                     │
              ┌──────┴──────┐
              │ Web Audio   │
              │ Mix-Minus   │
              │ + Program   │
              └──────┬──────┘
                     │
              ┌──────┴──────┐
              │  Icecast    │
              │  Streaming  │
              └─────────────┘
```

Each participant gets a personalized audio mix that excludes their own voice — no echo, no feedback, broadcast-quality audio in the browser.

## Features

- **WebRTC mesh** — peer-to-peer audio, no media server
- **Mix-minus** — each caller hears everyone except themselves
- **Per-participant controls** — individual gain, mute, level meters
- **Multi-track recording** — per-participant WAV + program mix
- **Icecast streaming** — broadcast to unlimited listeners
- **Role-based access** — host, ops, guest with permission controls
- **Zero dependencies** — vanilla JS, Web Audio API, no framework
- **Safari compatible** — WebSocket streaming fallback

## Live Demo

**[openstudio.zerologic.com](https://openstudio.zerologic.com)**

Create a room, share the URL, start broadcasting. Rooms auto-expire after 15 minutes on the demo.

## Architecture

For detailed architecture documentation, see [docs/ARCHITECTURE-IMPLEMENTATION.md](docs/ARCHITECTURE-IMPLEMENTATION.md).

**Stack**: Node.js · WebSocket · WebRTC · Web Audio API · Icecast · coturn

## Roadmap

- [x] **0.1** — Core studio: WebRTC mesh, mix-minus, mute controls, Icecast streaming
- [x] **0.2** — Single-server deploy, multi-track recording, live demo
- [ ] **0.3** — DHT station discovery, Nostr NIP-53 integration
- [ ] **0.4** — SFU for larger rooms (25+ participants)

## Development

```bash
# Development mode with hot reload
npm run dev

# Run tests
npm test

# With Docker services (Icecast + coturn)
docker compose up -d
npm start
```

See [docs/vision.md](docs/vision.md) for the full project vision and philosophy.

## Contributing

PRs welcome! Please read the existing code before contributing — the codebase is intentionally minimal.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

[MIT](LICENSE) — use it however you want.

---

<div align="center">
<strong>Own your voice. Control your broadcast.</strong>
</div>
