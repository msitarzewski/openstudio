# Architecture Implementation Guide

This document describes the **actual implementation** of OpenStudio 0.1 — the file structure, audio signal flow, signaling protocol, and key design decisions.

For the aspirational architecture (DHT discovery, federation, etc.), see `memory-bank/ARCHITECTURE.md`.

---

## File Structure

```
openstudio/
├── server/                          # Node.js signaling server
│   ├── server.js                    # HTTP + WebSocket entry point
│   ├── Dockerfile                   # Container build (Node 18 Alpine)
│   └── lib/
│       ├── logger.js                # ISO 8601 timestamped logging
│       ├── websocket-server.js      # WebSocket wrapper with ping/pong
│       ├── config-loader.js         # Station manifest loader
│       ├── validate-manifest.js     # Manifest schema validation
│       ├── message-validator.js     # Anti-spoofing message validation
│       ├── signaling-protocol.js    # Peer registry and message relay
│       ├── room.js                  # Room class (participants, broadcast)
│       └── room-manager.js          # Room lifecycle (UUID, auto-cleanup)
│
├── web/                             # Browser client (no bundler)
│   ├── index.html                   # Studio UI
│   ├── css/
│   │   ├── reset.css                # Cross-browser reset
│   │   └── studio.css               # Dark theme, CSS Grid layout
│   └── js/
│       ├── main.js                  # App orchestration (OpenStudioApp)
│       ├── signaling-client.js      # WebSocket client, auto-reconnect
│       ├── rtc-manager.js           # RTCPeerConnection lifecycle
│       ├── connection-manager.js    # Perfect Negotiation, mesh coordination
│       ├── audio-context-manager.js # AudioContext singleton
│       ├── audio-graph.js           # Per-participant node routing
│       ├── mix-minus.js             # O(N) phase-inversion algorithm
│       ├── program-bus.js           # Stereo mix + MediaStreamDestination
│       ├── return-feed.js           # HTMLAudioElement playback
│       ├── volume-meter.js          # Canvas-based RMS visualization
│       ├── mute-manager.js          # Producer-authoritative mute state
│       ├── stream-encoder.js        # MediaRecorder Opus wrapper
│       └── icecast-streamer.js      # HTTP PUT streaming + reconnection
│
├── tests/                           # Playwright browser tests
│   ├── test-webrtc.mjs              # 2-peer connection validation
│   ├── test-audio-graph.mjs         # AudioContext lifecycle
│   ├── test-gain-controls.mjs       # Per-participant gain controls
│   ├── test-program-bus.mjs         # Program bus and volume meter
│   ├── test-mix-minus.mjs           # 3-peer mix-minus validation
│   └── test-return-feed.mjs         # Bidirectional return feed
│
├── docker-compose.yml               # Icecast + coturn + signaling
├── icecast/                         # Custom multi-platform Icecast image
├── station-manifest.sample.json     # Station configuration template
├── dev.sh                           # Development workflow script
└── run-pre-validation.sh            # Automated test suite runner
```

---

## Audio Signal Flow

```
  Participant A (mic)                    Participant B (mic)
       │                                      │
       ▼                                      ▼
  MediaStreamSource                      MediaStreamSource
       │                                      │
       ▼                                      ▼
    GainNode (0-200%)                     GainNode (0-200%)
       │                                      │
       ▼                                      ▼
  DynamicsCompressor                     DynamicsCompressor
       │                                      │
       ├───────────┬──────────────────────────┤
       │           ▼                          │
       │     ChannelMerger ◄──────────────────┘
       │     (Program Bus)
       │           │
       │           ├──► AnalyserNode ──► VolumeMeter (canvas)
       │           ├──► MasterGain ──► AudioContext.destination (monitor)
       │           └──► MediaStreamDestination ──► Icecast Streamer
       │
       ▼
  Mix-Minus for B                        Mix-Minus for A
  (Program + InvertedB)                  (Program + InvertedA)
       │                                      │
       ▼                                      ▼
  MediaStreamDestination                 MediaStreamDestination
       │                                      │
       ▼                                      ▼
  RTCRtpSender (return feed)             RTCRtpSender (return feed)
       │                                      │
       ▼                                      ▼
  Participant B speakers                 Participant A speakers
  (via HTMLAudioElement)                 (via HTMLAudioElement)
```

### Mix-Minus Algorithm

Each participant needs to hear everyone *except themselves*. OpenStudio uses an O(N) **phase-inversion** approach:

```
MixMinus_i = ProgramBus + Inverted(Participant_i)
```

For each participant *i*:
1. Take the full program bus output (sum of all participants)
2. Create an inverted copy of participant *i* (gain = -1)
3. Sum them: the participant's own audio cancels out
4. Route the result back via WebRTC as a "return feed"

Implementation: `web/js/mix-minus.js` — `MixMinusManager` class.

### Stream Routing Order

Each WebRTC peer connection carries **two streams**:
1. **Microphone** (first) — routed to AudioGraph for mixing
2. **Return feed** (second) — played directly via HTMLAudioElement (bypasses AudioGraph to prevent feedback)

The `main.js` orchestrator tracks which streams have been received per peer using `receivedMicrophoneStreams` and `receivedReturnFeeds` sets.

---

## Signaling Protocol

The signaling server (`server/server.js`) runs HTTP + WebSocket on port 6736.

### Message Types

| Message | Direction | Purpose |
|---------|-----------|---------|
| `welcome` | Server → Client | Connection established |
| `register` | Client → Server | Register peer ID |
| `registered` | Server → Client | Registration confirmed |
| `create-room` | Client → Server | Create new room |
| `join-room` | Client → Server | Join existing room |
| `create-or-join-room` | Client → Server | Idempotent room access |
| `room-created` | Server → Client | Room created with ID |
| `room-joined` | Server → Client | Joined room + participant list |
| `peer-joined` | Server → Broadcast | New peer in room |
| `peer-left` | Server → Broadcast | Peer disconnected |
| `offer` | Client → Relay → Client | SDP offer (WebRTC) |
| `answer` | Client → Relay → Client | SDP answer (WebRTC) |
| `ice-candidate` | Client → Relay → Client | ICE candidate exchange |
| `mute` | Client → Broadcast | Mute state change |
| `error` | Server → Client | Error response |

### Anti-Spoofing

All relayed messages (`offer`, `answer`, `ice-candidate`) validate that the `from` field matches the sender's registered peer ID. Spoofed messages are rejected with an error.

### Room Lifecycle

1. Room created with UUID identifier
2. Participants join with role (`host`, `ops`, `guest`)
3. `peer-joined` / `peer-left` broadcast to all room members
4. Room auto-deleted when last participant leaves

---

## Key Design Decisions

### Perfect Negotiation Pattern

WebRTC connections use the [Perfect Negotiation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation) pattern to prevent glare (simultaneous offer) collisions:

- **Polite peer** (lower peer ID): Rolls back on collision, accepts incoming offer
- **Impolite peer** (higher peer ID): Ignores incoming offers during negotiation
- Implemented in `connection-manager.js` with `makingOffer` and `ignoreOffer` flags

### No Bundler Architecture

The web client uses ES modules natively — no webpack, Vite, or bundler required. All JS files use `import`/`export` and are loaded via `<script type="module">`. This keeps the development loop fast and the dependency footprint minimal for an MVP.

### Safari Compatibility

Four Safari WebAudio quirks were identified and fixed:
1. **Permission dialog timing**: `AudioContext.resume()` required after `getUserMedia()`
2. **Zero-gain suspension**: Safari suspends AudioContext when gain = 0; use 0.001 instead
3. **MediaStreamSource isolation**: Must connect to destination through analyser for Safari
4. **Canvas rendering delay**: Cosmetic only, no fix needed

See `docs/SAFARI_WEBAUDIO_QUIRKS.md` for details.

### Return Feed Playback

Return feeds (mix-minus audio sent back to participants) are played via `HTMLAudioElement` rather than routing through the AudioGraph. This prevents feedback loops — the return feed has already been mixed and should not re-enter the program bus.

### Icecast Streaming

The program bus output is encoded via `MediaRecorder` (Opus codec) and streamed to Icecast via HTTP PUT using the Fetch API with `TransformStream`. Exponential backoff reconnection handles network interruptions.

---

## Extension Points

### Adding New Participant Types
Extend the role system in `room.js` (server) and `main.js` (client). Current roles: `host`, `ops`, `guest`.

### Custom Audio Processing
Insert nodes into the per-participant chain in `audio-graph.js` between the GainNode and DynamicsCompressor.

### Alternative Streaming Outputs
Replace or extend `icecast-streamer.js` with other streaming targets. The `program-bus.js` provides a `MediaStream` via `getMediaStream()`.

### Recording
The `MediaStreamDestination` on the program bus (in `program-bus.js`) can feed a local `MediaRecorder` for recording. Per-track recording would require tapping individual participant nodes in `audio-graph.js`.
