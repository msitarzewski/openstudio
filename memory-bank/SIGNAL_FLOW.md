# Signal Flow & Mix‑Minus

## 1) Session bring‑up
1. Host opens Studio → obtains station config & keys → connects to WS signaling.
2. Host creates a Room; signaling hands back an offer template and room token.
3. Additional hosts and callers join via invite URL; WS coordinates SDP exchange.
4. All peers attempt ICE; STUN first, TURN fallback via coturn.

## 2) Audio routing (Web Audio Graph)
- Each remote track is a `MediaStreamAudioSourceNode`.
- For each participant *i*, we create:
  - `GainNode` (mute = 0, live > 0)
  - `DynamicsCompressorNode` (light leveling)
  - `ChannelMerger` for stereo program if desired.

### Program Bus
All participants feed a `Program` bus. The Program bus is captured for:
- Live monitor to hosts
- Icecast encoder pipeline (via `MediaRecorder` → OGG/Opus)

### Mix‑Minus Bus per Caller
For caller *i*, we build: `MixMinus_i = Program - i`
- Implemented by summing all sources **except i** into a `MixMinus_i` bus.
- Route `MixMinus_i` back to caller *i* via a dedicated WebRTC `RTCRtpSender` track.

This avoids self‑echo while preserving everything else (hosts, music, other callers).

## 3) Mute semantics
- **Hard Mute (producer):** sets caller gain to 0 and stops uplink track via `sender.replaceTrack(null)` (optional hard cut).
- **Soft Mute (self):** local mic gain = 0; UI reflects state.
- UI keeps producer state authoritative; conflicts resolved by producer last‑write‑wins.

## 4) Failure modes
- Peer drops: WS detects `peer_disconnected` → remove nodes; if host drops, elect a new producer if configured.
- TURN-only path: latency budget rises; degrade to audio‑only (no video), reduce Opus bitrate.
- Icecast outage: buffer locally and retry; optional secondary mountpoint.

## 5) Security
- Ed25519 station keys sign directory records.
- DTLS-SRTP on all media paths.
- Room tokens (JWT) scoped to role (host/caller) and time‑boxed.
