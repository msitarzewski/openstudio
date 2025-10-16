# Product Requirements Document — OpenStudio

> A decentralized, open-source virtual broadcast studio for live call‑in shows.

## 1. Vision
Build an open-source, peer-to-peer radio studio platform that anyone can self-host.
Users can start a station, invite hosts, take live web call‑ins, mix audio, and stream live —
all without commercial dependencies or central servers.

## 2. Core Principles
- Zero commercial lock‑in (MIT/BSD/GPL deps only)
- Distributed by design (DHT/gossip station directory)
- Self‑sovereign broadcast control
- Accessible install (one‑command bootstrap)
- Composable modules

## 3. MVP (R0.1)
**Goal:** Multi-host voice studio, Y callers, per‑participant mute, mix‑minus, Icecast output.

**Acceptance:**
- N hosts + Y callers stable for 60 min session
- Global mute/unmute works instantly (<150 ms local reaction)
- Mix‑minus confirmed for callers (no self‑echo)
- OGG/Opus stream playable via Icecast mountpoint
- Setup from fresh clone < 5 min

## 4. Releases
- **0.1 – Core Loop (3 mo):** signaling, rooms, mute, mix‑minus, Icecast, CLI
- **0.2 – Distributed Stations (2 mo):** DHT directory, identities, auth tokens
- **0.3 – Call‑in System (3 mo):** waiting room, screening UI, per‑caller gain
- **0.4 – Extended (3 mo):** recording, jingles, relays, remote moderation
- **0.5 – Federation & APIs (4 mo):** REST/WS API, cross‑station linking, Matrix bridge

## 5. Stack
- Signaling: Node.js + WebSocket; NAT: coturn (TURN/STUN)
- Media: WebRTC (Opus); Web Audio for local mixing
- Streaming: Icecast (OGG/Opus)
- Directory: WebTorrent‑DHT or libp2p
- Auth: Ed25519 keypairs; signed station manifests
- Deploy: Docker; dev CLI bootstrap

## 6. Risks
Browser WebRTC quirks; TURN costs/availability; DHT abuse; latency variance;
security/DoS against open signaling; time sync drifts for recordings.

## 7. Sponsorship
GitHub Sponsors per module; pathed “core maintainers” file; monthly release cadence with changelog.
