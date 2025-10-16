# System Patterns: OpenStudio

## Architecture Patterns

### 1. Peer-to-Peer Media, Centralized Signaling

**Pattern**: Media flows directly between peers (WebRTC); coordination happens via WebSocket signaling server

**Rationale**:
- Reduces server bandwidth costs (no media relay)
- Minimizes latency for audio
- Simplifies scaling (signaling is lightweight)

**Implementation**:
- Signaling server coordinates SDP exchange
- STUN/TURN (coturn) only for NAT traversal
- Each peer maintains direct RTC connections

### 2. Web Audio Graph for Mixing

**Pattern**: Use Web Audio API nodes for per-participant gain, compression, and routing

**Rationale**:
- Native browser performance
- No server-side processing required
- Real-time parameter adjustment
- Complex routing (mix-minus) possible

**Structure**:
```
MediaStreamSource → GainNode → DynamicsCompressor → ChannelMerger → Destination
                                                    ↓
                                              ProgramBus / MixMinusBus
```

### 3. Mix-Minus per Caller

**Pattern**: Create individualized audio mixes for each caller that exclude their own voice

**Rationale**:
- Prevents self-echo/feedback
- Standard broadcast technique
- Essential for caller experience quality

**Implementation**:
- Program Bus = sum of all participants
- MixMinus_i = Program - participant_i
- Route MixMinus_i back to caller i via dedicated RTC track

### 4. Producer-Authoritative Control

**Pattern**: Host/producer has final authority over mute states and routing

**Rationale**:
- Prevents caller disruption
- Standard broadcast control model
- Simplified conflict resolution

**Rules**:
- Producer can mute any participant
- Self-mute is local but reported to producer
- Producer state wins on conflicts (last-write-wins)

### 5. Distributed Station Directory

**Pattern**: DHT/libp2p for station discovery, no central registry

**Rationale**:
- Censorship resistance
- No single point of failure
- Scales without central infrastructure
- Aligned with self-hosting philosophy

**Implementation** (planned for 0.2):
- Ed25519 keypairs for station identity
- Signed manifests published to DHT
- Stations self-announce availability
- Clients query DHT for discovery

## Component Structure

### Signaling Server

**Responsibilities**:
- WebSocket connection management
- SDP offer/answer coordination
- ICE candidate relay
- Room state management
- Authentication token validation

**Tech**: Node.js, WebSocket library, minimal dependencies

### Web Studio Client

**Responsibilities**:
- User interface for hosts/producers
- Web Audio graph construction
- RTC peer management
- Local audio mixing
- Program output encoding

**Tech**: Vanilla JS (initially), Web Audio API, WebRTC API

### TURN/STUN Server

**Responsibilities**:
- NAT traversal assistance
- Media relay fallback

**Tech**: coturn (Docker container)

### Streaming Output

**Responsibilities**:
- Receive encoded program audio
- Distribute to listeners
- Standard mount point access

**Tech**: Icecast (Docker container)

## Data Flow Patterns

### Session Initialization

1. Host connects to signaling server
2. Creates room, receives room token
3. Shares invite URL with participants
4. Participants connect, exchange SDP via signaling
5. ICE negotiation establishes peer connections
6. Audio tracks flow, Web Audio graph routes signals

### Audio Mixing Flow

1. Remote tracks arrive via RTC
2. Each track → MediaStreamAudioSourceNode
3. Gain + compression applied per-participant
4. All sources sum to Program Bus
5. Program Bus → MediaRecorder → Icecast
6. Mix-minus calculated per-caller
7. Mix-minus sent back via dedicated RTC tracks

### Control Messages

- Mute/unmute: Signaling propagates to all peers
- Gain adjustment: Local only (no signaling needed)
- Room membership: Signaling broadcasts join/leave events

## Security Patterns

### Station Authentication

- Ed25519 keypair per station
- Station manifest signed by private key
- Public key published to directory
- Clients verify signatures before connecting

### Room Access Control

- JWT tokens for room entry
- Scoped to role: host vs. caller
- Time-boxed expiration
- Issued by station owner's signaling server

### Media Security

- DTLS-SRTP on all RTC connections
- No unencrypted media transport
- Browser enforces secure contexts (HTTPS required)

## Error Handling Patterns

### Peer Disconnection

- Signaling detects via WebSocket close
- Remove peer from audio graph
- Notify remaining participants
- Optional: Elect new producer if host drops

### TURN-Only Fallback

- Detect high latency path
- Degrade to audio-only (disable video if present)
- Reduce Opus bitrate to improve stability
- UI warns user of degraded mode

### Icecast Outage

- Buffer program audio locally
- Retry connection with exponential backoff
- Optional: Failover to secondary mount point
- Notify producer of streaming status

## Scaling Patterns

### Horizontal Signaling

- Multiple signaling servers possible
- Each manages subset of rooms
- Station manifest points to primary signaling URL
- Directory queries route to correct server

### Media Mesh Limits

- Practical limit: ~10-15 simultaneous participants
- Beyond this, consider SFU (Selective Forwarding Unit)
- Future: Optional SFU mode for large events

## Testing Patterns

### Unit Tests

- Audio graph node construction
- Mix-minus calculation logic
- Room state management
- Token generation/validation

### Integration Tests

- Signaling server message flows
- ICE negotiation sequences
- Audio routing verification
- Icecast output validation

### E2E Tests

- Full session bring-up
- Multi-peer scenarios
- Mute/unmute propagation
- Disconnection handling

### Performance Tests

- Session duration (60+ min stability)
- Mute latency (<150ms)
- Audio quality metrics (no dropouts)
- Resource usage (CPU, memory, bandwidth)
