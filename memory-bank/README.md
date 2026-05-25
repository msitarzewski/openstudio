# OpenStudio (working title)

A zero‑dependency, open-source, self-hostable virtual radio studio. No SaaS required.

## Quick start (v0.3-dev — Post Power Move)
```bash
# 1) clone and init submodules (whisper.cpp)
git clone https://github.com/msitarzewski/openstudio.git
cd openstudio && git submodule update --init

# 2) copy and edit your station manifest
cp station-manifest.sample.json station-manifest.json

# 3) install deps and go live
npm start   # serves the full studio at http://localhost:6736

# 4) optional: bring up Icecast + coturn for production
docker compose up -d

# 5) deploy to openstudio.zerologic.com via systemctl or docker
```

## What's New (Power Move — ~2026-05)

After the core studio went live, OpenStudio added post-production capabilities:
- **Whisper.cpp transcription** — On-device speech-to-text, no cloud dependency
- **Audio cleaning pipeline** — Noise reduction + loudness normalization + filler/silence splice detection
- **Clean/Raw export** — Record, then export your audio cleaned or raw (WAV)
- **ffmpeg integration** — Professional-grade audio processing in the pipeline

## Memory Bank

This directory contains your memory bank for OpenStudio. It's designed to persist across Agent sessions, ensuring continuity and consistency:

- **projectbrief.md** — Core vision and requirements
- **productContext.md** — Why this exists and user goals
- **systemPatterns.md** — Architecture and design patterns (updated with Power Move)
- **techContext.md** — Tech stack, constraints, and new tools (updated with Power Move)
- **activeContext.md** — Current focus, decisions, and branch status (updated with Power Move)
- **progress.md** — What's working and what's next (updated with Power Move)
- **projectRules.md** — Project-specific patterns and preferences

## Architecture Overview

```
Client (browser) ── WebSocket ── Node.js Server (port 6736)
                                    ├─ Static files (/web/*)
                                    ├─ API (/health, /api/station, /api/upload, /api/export/*)
                                    ├─ WebSocket (signaling + JWT auth)
                                    └─ Icecast proxy (/stream/*)

Post-Production Pipeline:
Upload → Whisper transcribe + clean → Export (Raw or Clean WAV)
```

- See `ARCHITECTURE.md` and `SIGNAL_FLOW.md` for diagrams and routing details.
- See `activeContext.md` for current branch status and recent decisions.
