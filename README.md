[![CI](https://github.com/msitarzewski/openstudio/actions/workflows/ci.yml/badge.svg)](https://github.com/msitarzewski/openstudio/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) ![Node 18+](https://img.shields.io/badge/node-18%2B-brightgreen) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/msitarzewski/openstudio/pulls) [![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-pink?logo=github)](https://github.com/sponsors/msitarzewski)

<div align="center">
<img src="docs/screenshots/studio.png" alt="OpenStudio broadcast interface" width="720">
</div>

# OpenStudio

> Your voice. Your frequency. No permission required.

[Try the Live Demo](https://openstudio.zerologic.com) · [Report Bug](https://github.com/msitarzewski/openstudio/issues) · [Sponsor](https://github.com/sponsors/msitarzewski)

---

Somewhere right now, a community radio host is calculating whether they can afford another month of their streaming platform. A podcast collective just lost their entire archive because a service shut down. An independent voice got silenced — not by censorship, but by a credit card expiration.

OpenStudio exists because broadcasting should not require permission. No account creation. No monthly invoice. No terms of service between you and your audience. You clone a repo, you start broadcasting. Your station runs on your hardware. Your audio never touches a server you don't control.

This is a broadcast studio built the way radio was meant to work — direct, unmediated, yours. Vanilla JavaScript. Web Audio API. No framework, no build step, no dependency you didn't choose. Self-host it on a Raspberry Pi, a $5 VPS, a closet server at the back of your hackerspace. The entire client is under 50KB. If you can run Node, you can run a station — rent free.

Connect guests over WebRTC mesh. Mix-minus gives every participant broadcast-quality monitoring — the same technique used in professional studios, now running in a browser tab. Stream to unlimited listeners through Icecast. Record every voice on its own track for post-production. No platform stands between your signal and the world.

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
│  Host   │◄────────────────►│ Caller  │
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

Mix-minus is a broadcast engineering standard — each participant hears everyone except themselves. No echo, no feedback. Professional studios have done this with hardware for decades. OpenStudio does it in the browser with the Web Audio API.

## Features

**Broadcast core**
- WebRTC mesh — peer-to-peer audio, no media server, up to ~15 participants
- Mix-minus per participant — O(N) phase-inversion, broadcast-standard monitoring with zero echo
- Per-participant gain, mute, and segmented LED level meters with waveform oscilloscope
- Microphone input selector — enumerates all OS audio devices
- Icecast streaming — broadcast to unlimited listeners through your own domain
- WebSocket streaming fallback for Safari (browsers without ReadableStream upload)
- Listener proxy at `/stream/*` so the entire app runs on a single port

**Recording & post-production**
- Multi-track recording — per-voice WAV/WebM + program mix, all captured client-side
- Single-zip bundle download for the whole session
- Audio cleaning pipeline — silence detection, filler-word splice, two-pass loudness normalization to −16 LUFS
- Raw or Clean export with WAV / WebM / MP3 (podcast-ready) output

**Optional AI tooling** (runs entirely on your hardware — see setup below)
- On-device transcription via whisper.cpp — no cloud API, no third party
- LLM-generated show notes — episode title, summary, timestamped segment markers
- Markdown export — copy to clipboard or download as `.md`

**Security & ops**
- JWT room tokens (24 h) and scoped invite tokens (4 h)
- Role-based access — host, ops, guest (caller) with producer-authoritative mute
- 256 KB WebSocket message cap, per-IP connection limit, sliding-window rate limits
- CORS allowlist (open by default for dev), hardened security headers, sanitized listener proxy
- Self-hosted variable fonts (Inter, JetBrains Mono, Space Grotesk) — no Google Fonts CDN dependency

**Zero dependencies in the browser** — vanilla JavaScript, Web Audio API, no framework, no build step. The entire client is under 50 KB.

## Optional AI Tooling

OpenStudio includes a complete post-production pipeline that runs entirely on your hardware — no cloud API, no third-party calls, no data leaving your machine. It's **optional**: broadcasting, recording, and per-track downloads work without any of this.

### Prerequisites
- `ffmpeg` and `ffprobe` on your `PATH` (most package managers ship both: `brew install ffmpeg`, `apt install ffmpeg`)
- ~1.5 GB free disk space for the default Whisper model

### whisper.cpp setup (one-time)

```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp && make -j$(nproc)
cd .. && mkdir -p models
wget -O models/ggml-medium.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin
```

You can swap the model — `ggml-tiny.bin` (~75 MB) is faster but less accurate; `ggml-large.bin` is the other direction. The server looks for `models/ggml-medium.bin` by default.

### LLM setup (for show notes)

Show notes call any **OpenAI-compatible** chat completions API — LM Studio, Ollama with the OpenAI shim, vLLM, llama.cpp server, etc. Configure via env vars in `.env`:

```bash
LLM_BASE_URL=http://localhost:1234/v1   # default — matches LM Studio
LLM_MODEL=qwen3.5-35b                    # any chat model your server exposes
```

If the LLM is unreachable, show notes still generate — they just fall back to a transcript-derived title and summary instead of an LLM-authored one. Transcription itself does not depend on the LLM.

### What happens without AI setup

The "Transcribe Recording" button surfaces a clear error if `whisper.cpp` isn't built. Every other feature — live broadcast, recording, per-track download, zip bundle, Icecast streaming — works without any AI setup.

## Try It

1. Open **[openstudio.zerologic.com](https://openstudio.zerologic.com)**
2. Enter a station name and click **Start Broadcast**
3. Allow microphone access when prompted
4. Share the invite URL with a co-host (or open it in a second browser tab)
5. Talk — you'll hear each other with zero echo thanks to mix-minus
6. Hit **Record** to capture per-voice tracks, then **Download** when done

Broadcasts auto-expire after 15 minutes on the demo. Self-host for unlimited airtime.

## Architecture

For detailed architecture documentation, see [docs/ARCHITECTURE-IMPLEMENTATION.md](docs/ARCHITECTURE-IMPLEMENTATION.md).

**Stack**: Node.js · WebSocket · WebRTC · Web Audio API · Icecast · coturn

## Roadmap

- [x] **0.1** — Core studio: WebRTC mesh, mix-minus, mute controls, Icecast streaming
- [x] **0.2** — Single-server deploy, multi-track recording, live demo
- [x] **0.2.1** — Security hardening: JWT room tokens, rate limiting, CORS, RBAC
- [x] **0.3** — Power Move: Whisper.cpp transcription, audio cleaning pipeline, Clean/Raw export, self-hosted fonts
- [x] **0.3.1** — MP3 export fix, single-zip bundle download, configurable LLM endpoint
- [ ] **0.4** — Invite-link UI, DHT station discovery, Nostr NIP-53 integration, Ed25519 station identities
- [ ] **0.5** — SFU for larger rooms (25+ participants), soundboard, text chat

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

## Known Gaps

Honest about what's there and what isn't:

- **Invite-link UI** — the server can mint scoped invite tokens (host / ops / guest, 4 h TTL), but the host UI doesn't expose a button yet. For now, hosts share the room URL manually. Coming in 0.4.
- **AI pipeline setup is manual** — the whisper.cpp build, model download, and LLM configuration aren't scripted. A `setup-ai.sh` would be a great PR.
- **whisper.cpp gitlink** — the repo references whisper.cpp as a gitlink without a `.gitmodules` entry. Use the manual `git clone` in the AI setup section above; `git submodule update` will fail.
- **Mesh scale ceiling** — WebRTC mesh tops out around 15 participants. Larger rooms need an SFU (planned for 0.5).

## Contributing

PRs welcome! Please read the existing code before contributing — the codebase is intentionally minimal.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## Sponsor

OpenStudio is free, open-source, and built by independent developers. If it's useful to you, [sponsor the project on GitHub](https://github.com/sponsors/msitarzewski) to keep it that way.

## License

[MIT](LICENSE) — use it however you want.

---

<div align="center">
<em>talk hard.</em>
</div>
