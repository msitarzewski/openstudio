# Active Context: OpenStudio

**Last Updated**: 2025-10-18

## Current Phase

**Release**: 0.1 MVP (Core Loop)
**Status**: Implementation In Progress (9/20 tasks complete, 45%)
**Focus**: Milestone 3 - Multi-Peer Audio (25% complete: 1/4 tasks, task 010 next)

## Recent Decisions

### 2025-10-19: Web Audio Foundation (Task 009)

**Decision**: Implement Web Audio API foundation with AudioContext singleton and participant audio graph routing

**Rationale**:
- HTMLAudioElement approach from Task 008 has no mixing capability
- Web Audio graph enables per-participant gain control, compression, and routing
- Foundation required for Program Bus (Task 011) and Mix-Minus (Task 014-016)
- Browser autoplay policy requires careful AudioContext state management
- Separation of concerns: lifecycle (audio-context-manager) vs routing (audio-graph)

**Implementation**:
- Created web/js/audio-context-manager.js (162 lines) - AudioContext singleton with lifecycle
- Created web/js/audio-graph.js (229 lines) - Participant node management and routing
- Modified web/js/rtc-manager.js (-34 lines) - Removed HTMLAudioElement auto-play
- Modified web/js/main.js (+68 lines) - Audio system initialization and integration
- Created test-audio-graph.mjs (113 lines) - Automated Playwright test

**Audio Graph Architecture**:
```
Remote MediaStream
       ↓
MediaStreamAudioSourceNode
       ↓
GainNode (volume: 0.0 to 2.0, default: 1.0 = 0dB)
       ↓
DynamicsCompressorNode (threshold: -24dB, ratio: 12:1, attack: 3ms, release: 250ms)
       ↓
AudioContext.destination (speakers)
```

**Lifecycle Management**:
- AudioContext created on page load (state: suspended)
- Resume on Start Session button (user interaction, autoplay policy compliance)
- Event-driven state changes: `initialized`, `resumed`, `suspended`, `statechange`
- Browser compatibility: `window.AudioContext || window.webkitAudioContext`

**Testing**:
- ✅ Automated Playwright test: AudioContext creation, state management, audio graph initialization
- ✅ All tests passing: Created ✅, Resumed ✅, Graph initialized ✅
- ✅ Browser console debugging: `audioContextManager.getState()`, `audioGraph.getGraphInfo()`
- ✅ Chrome DevTools Web Audio inspector compatible

**API Design**:
```javascript
// AudioContext lifecycle
audioContextManager.initialize()
await audioContextManager.resume()
audioContextManager.getState() // 'suspended' | 'running'

// Audio graph operations
audioGraph.initialize()
audioGraph.addParticipant(peerId, mediaStream)
audioGraph.removeParticipant(peerId)
audioGraph.setParticipantGain(peerId, 1.0) // 0.0 to 2.0
audioGraph.muteParticipant(peerId)
audioGraph.unmuteParticipant(peerId)
audioGraph.getGraphInfo() // Debug info
```

**Next Step**: Task 010 will add UI controls (sliders, mute buttons, level meters) for the audio graph foundation

### 2025-10-18: First WebRTC Peer Connection (Task 008)

**Decision**: Implement three-layer event-driven architecture for WebSocket and WebRTC communication

**Rationale**:
- Clean separation of concerns: signaling ↔ RTC ↔ UI
- EventTarget pattern enables loose coupling and testability
- ES modules provide native browser support without bundler overhead
- Playwright automated testing validates architecture without manual intervention
- URL hash for room sharing is simple and effective for MVP

**Implementation**:
- Created web/js/signaling-client.js (268 lines) - WebSocket client with auto-reconnection
- Created web/js/rtc-manager.js (324 lines) - RTCPeerConnection manager with getUserMedia
- Created web/js/main.js (469 lines) - Application orchestration and UI integration
- Created test-webrtc.mjs (330 lines) - Playwright automated browser test

**WebRTC Flow**:
- Host: Start Session → getUserMedia → Create Room → Create Offer → Wait for Caller
- Caller: Join Room (from URL hash) → getUserMedia → Receive Offer → Create Answer
- Both: Exchange ICE candidates as generated → Connection established → Audio auto-plays

**Testing**:
- ✅ Playwright automated test: 2 browser instances connect successfully
- ✅ Host creates room with UUID, caller joins via URL hash
- ✅ SDP offer/answer exchange working
- ✅ ICE candidate exchange working
- ✅ Participant tracking working (2 cards visible on both sides)
- ✅ Mute/unmute controls working
- ✅ End session cleanup working
- ✅ All 18 server tests still passing (regression verification)

**Architecture**:
- SignalingClient extends EventTarget (events: connected, registered, room-created, peer-joined, offer, answer, ice-candidate)
- RTCManager extends EventTarget (events: initialized, local-stream, ice-candidate, remote-stream, connection-state)
- Main app coordinates both via event subscriptions
- One room per peer (simplifies state management)
- Room ID shared via URL hash (#room-uuid)

**Files Created**:
- web/js/signaling-client.js
- web/js/rtc-manager.js
- web/js/main.js
- test-webrtc.mjs

**Next Step**: Task 009 will create Web Audio graph for multi-participant mixing

### 2025-10-18: Web Studio HTML/CSS Scaffold (Task 007)

**Decision**: Create clean, minimalist web interface with semantic HTML5 and responsive CSS Grid layout

**Rationale**:
- Provides visual foundation for WebRTC controls and participant display
- CSS custom properties enable consistent theming and future customization
- Mobile-first responsive design ensures accessibility across devices
- Zero framework dependencies for simplicity and performance
- Dark theme reduces eye strain for long studio sessions

**Implementation**:
- Created web/css/reset.css (63 lines) - Modern CSS reset for cross-browser consistency
- Created web/css/studio.css (290 lines) - Dark theme with CSS Grid, responsive breakpoints, CSS variables
- Created web/index.html (62 lines) - Semantic HTML5 structure with placeholder participant cards
- Manual testing validated all acceptance criteria (browser rendering, responsive behavior)

**Design System**:
- CSS custom properties for colors, spacing, layout, border radius
- Dark theme (#1a1a1a bg) with blue accent (#3b82f6)
- System font stack (no web fonts)
- Connection status: red (disconnected pulse), yellow (connecting), green (connected)
- Button states: enabled/disabled with visual feedback

**Layout**:
- Sticky header with branding and status indicator
- CSS Grid participant section (auto-fill, minmax(250px, 1fr))
- Flexbox controls section with three buttons
- Responsive breakpoints: 768px (tablet), 480px (mobile)

**HTML Structure**:
- Semantic elements: `<header>`, `<main>`, `<section>`
- Proper meta tags (viewport, description, charset)
- Three placeholder participant cards (host + 2 callers)
- Control buttons: Start Session (enabled), Mute (disabled), End Session (disabled)

**Testing**:
- ✅ Page renders correctly in browser (http://localhost:8080)
- ✅ Connection status displays with red pulsing dot
- ✅ Participant cards visible with gradient avatars
- ✅ Buttons render with correct enabled/disabled states
- ✅ Responsive layout adapts to different screen sizes
- ✅ No console errors on page load

**Files Created**:
- web/css/reset.css
- web/css/studio.css
- web/index.html

**Next Step**: Task 008 will add WebSocket client JavaScript to connect to signaling server and implement room creation/joining

### 2025-10-18: Room Management System (Task 006)

**Decision**: Implement room-based organization for sessions with UUID room IDs, participant tracking, and event broadcasting

**Rationale**:
- Rooms provide organizational structure for multi-participant sessions
- UUID v4 provides collision-resistant room identifiers without coordination
- Auto-cleanup prevents orphaned rooms when all participants leave
- One room per peer simplifies state management for MVP
- Event broadcasting keeps all participants synchronized

**Implementation**:
- Created server/lib/room.js (147 lines) - Room class with participant tracking and broadcast
- Created server/lib/room-manager.js (218 lines) - Room lifecycle with UUID generation and auto-cleanup
- Modified server/lib/websocket-server.js (+112 lines) - Added create-room/join-room handlers, disconnect cleanup
- Modified server/lib/signaling-protocol.js (+30 lines) - Added room validation and broadcast helper
- Created server/test-rooms.js (538 lines) - 9 automated tests (100% pass rate)

**Room Structure**:
- UUID v4 room ID (crypto.randomUUID)
- Host: First participant (creator) with 'host' role
- Callers: All subsequent participants with 'caller' role
- Bidirectional lookup: roomId → Room, peerId → roomId
- In-memory storage (Map-based)

**Message Protocol**:
- Create room: Client sends `{type: 'create-room'}`, server responds with `{type: 'room-created', roomId, hostId}`
- Join room: Client sends `{type: 'join-room', roomId}`, server responds with `{type: 'room-joined', roomId, participants}`
- Broadcast peer-joined: `{type: 'peer-joined', peerId, role}` to all existing participants (excludes joiner)
- Broadcast peer-left: `{type: 'peer-left', peerId}` to remaining participants on disconnect

**Room Lifecycle**:
- Created when host sends create-room message
- Participants join with room ID
- Auto-deleted when last participant leaves
- Clean up peer-to-room mappings on deletion

**Validation**:
- Peers must register before creating/joining rooms
- Peers can only be in one room at a time
- Room must exist to join (error if not found)
- Broadcast excludes triggering peer (no echo)

**Testing**:
- ✅ Create room returns UUID
- ✅ Join room returns participant list and broadcasts peer-joined
- ✅ Multiple participants all receive notifications
- ✅ Disconnect broadcasts peer-left to remaining participants
- ✅ Last participant leaving deletes room
- ✅ Join non-existent room returns error
- ✅ Each room gets unique UUID
- ✅ Peer cannot join multiple rooms
- ✅ Must register before room operations

**Files Created**:
- server/lib/room.js
- server/lib/room-manager.js
- server/test-rooms.js

**Files Modified**:
- server/lib/websocket-server.js (added room handlers and disconnect cleanup)
- server/lib/signaling-protocol.js (added room validation and broadcast helper)

### 2025-10-18: WebSocket Signaling Protocol (Task 005)

**Decision**: Implement peer registration with anti-spoofing validation and message relay for WebRTC signaling

**Rationale**:
- WebRTC requires SDP exchange and ICE candidate relay between peers
- Security critical: prevent peers from impersonating each other
- Clear separation of validation, registry, and routing logic
- Comprehensive testing ensures reliability

**Implementation**:
- Created server/lib/message-validator.js (136 lines) - Message validation with anti-spoofing
- Created server/lib/signaling-protocol.js (158 lines) - Peer registry and message relay
- Modified server/lib/websocket-server.js (+74 lines) - Integrated protocol and routing
- Created server/test-signaling.js (429 lines) - 9 automated tests (100% pass rate)

**Peer Registration**:
- Clients send `{"type": "register", "peerId": "peer-a-id"}` on connection
- Server responds with `{"type": "registered", "peerId": "peer-a-id"}`
- First-registration-wins for duplicate peer IDs
- Automatic cleanup on disconnect

**Message Validation**:
- All signaling messages validated before relay
- `from` field must match registered peer ID (anti-spoofing)
- Required fields: type, from, to
- Type-specific validation: sdp for offer/answer, candidate for ice-candidate
- Clear error messages returned to sender

**Message Relay**:
- Server routes messages from sender to target peer
- No confirmation response (relay itself is confirmation)
- Error response if target peer not found or connection closed
- All relay actions logged for debugging

**Testing**:
- ✅ Peer registration working
- ✅ Duplicate peer ID rejection
- ✅ Offer relay from peer A to peer B
- ✅ Answer relay from peer B to peer A
- ✅ ICE candidate relay
- ✅ Unregistered peer rejection
- ✅ Target peer not found error
- ✅ Spoofed "from" field rejection
- ✅ Malformed message rejection

**Files Created**:
- server/lib/message-validator.js
- server/lib/signaling-protocol.js
- server/test-signaling.js

**Files Modified**:
- server/lib/websocket-server.js (added peer registry, validation, routing)

### 2025-10-18: Configuration Management (Task 004)

**Decision**: Load and validate station-manifest.json on server startup, fail fast on errors

**Rationale**:
- Prevents server from running with invalid configuration
- Provides clear error messages for configuration problems
- Fallback to sample manifest enables easy development setup
- Fail fast pattern aligns with projectRules.md error handling

**Implementation**:
- Created server/lib/validate-manifest.js (103 lines) - Schema validation
- Created server/lib/config-loader.js (73 lines) - Load with fallback logic
- Modified server/server.js - Load config before server starts, add /api/station endpoint
- Updated Dockerfile and docker-compose.yml - Build context at project root to access manifest files
- Created station-manifest.sample.json - Development configuration

**Validation**:
- Required fields: stationId, name, signaling.url, ice.stun array
- Optional fields: ice.turn array (but validated if present)
- URL format validation: WebSocket URLs (ws:// or wss://), STUN/TURN URLs
- Clear error messages for each validation failure

**Fallback Behavior**:
- If station-manifest.json missing → Use station-manifest.sample.json with warning
- If both missing → Exit with error
- If JSON invalid → Exit with parse error details
- If validation fails → Exit with all validation errors listed

**Testing**:
- Server loads manifest: ✅ Logs "Loaded station manifest: OpenStudio Development Station (openstudio-dev)"
- /api/station endpoint: ✅ Returns complete config including ICE servers
- Fallback to sample: ✅ Warning logged, server uses sample successfully
- Corrupt JSON handling: ✅ Clear error "Invalid JSON in manifest file: Unexpected end of JSON input"

**Files Created**:
- station-manifest.sample.json
- server/lib/validate-manifest.js
- server/lib/config-loader.js

**Files Modified**:
- server/server.js (added config loading and /api/station endpoint)
- server/Dockerfile (copy manifest files from project root)
- docker-compose.yml (build context changed to project root)

### 2025-10-18: Signaling Server Port Configuration (Task 003)

**Decision**: Use port 3000 for signaling server (not 8080 from task spec)

**Rationale**:
- docker-compose.yml already configured with PORT=3000 environment variable
- Avoids confusion with Icecast on port 8000 (similar-looking port numbers)
- Minimizes changes to existing infrastructure configuration
- package.json already has `"main": "server.js"` and start script configured

**Implementation**:
- Created server/server.js (93 lines) - HTTP + WebSocket server
- Created server/lib/logger.js (48 lines) - ISO 8601 timestamped logger
- Created server/lib/websocket-server.js (78 lines) - WebSocket wrapper with ping/pong
- Updated Dockerfile CMD from placeholder to `node server.js`
- Updated Dockerfile health check to use GET /health endpoint
- Updated tasks 003 and 004 YAML files to reflect port 3000 standard

**Testing**:
- WebSocket ping/pong: ✅ Working (timestamp in response)
- Health check endpoint: ✅ HTTP 200 OK {"status":"ok","uptime":N}
- Graceful shutdown: ✅ SIGTERM handled cleanly
- Connection logging: ✅ Client IP logged on connect/disconnect

**Files Created**:
- server/server.js
- server/lib/logger.js
- server/lib/websocket-server.js
- server/test-ws.js (test helper)

### 2025-10-17: Docker Infrastructure Configuration (Task 002)

**Decision**: Use network_mode: host for coturn, limit relay port range to 49 ports

**Rationale**:
- Initial attempt with 16,384 port mappings (49152-65535) failed - Docker couldn't allocate
- network_mode: host gives coturn direct network access without port mapping overhead
- 49 ports (49152-49200) sufficient for MVP (~25 concurrent peers with media relay)
- Simplifies configuration, avoids NAT overhead for TURN relay
- Development credentials (hackme) acceptable for local testing

**Implementation**:
- docker-compose.yml created with 3 services: Icecast, coturn, signaling placeholder
- coturn: network_mode host, limited relay ports, basic STUN/TURN config
- Icecast: bridge network, port 8000, development credentials
- signaling: placeholder Dockerfile (Node 18-alpine, health check)
- All services verified operational: Icecast (HTTP 200), coturn (port 3478 listening), signaling (healthy)

**Issues Resolved**:
- Removed obsolete `version` field (Docker Compose v2 warning)
- Removed unsupported coturn options (`--no-tlsv1`, `--no-tlsv1_1`)
- Changed from massive port range to host networking

### 2025-10-16: Release 0.1 Task Breakdown Structure

**Decision**: Create comprehensive YAML-based task breakdown with visual progress tracking

**Rationale**:
- Need granular, executable tasks for incremental development
- File-based progress tracking provides visibility without tooling overhead
- Individual task files enable focused implementation sessions
- X-marker naming convention gives instant visual feedback
- Complete task metadata ensures self-contained context

**Implementation**:
- Created `memory-bank/releases/0.1/` directory structure
- 20 individual YAML task files (001-020)
- 5 milestones: Foundation, Basic Connection, Multi-Peer Audio, Mix-Minus, Production Ready
- Each task: 2-6 hours estimated, includes context, dependencies, acceptance criteria, tests, references
- Progress tracking: rename `NNN_task.yml` → `NNN_X_task.yml` when complete
- Workflow documented in releases/0.1/README.md

**YAML Schema**:
```yaml
id, title, component, estimated_hours
context (why it matters)
depends_on (prerequisite tasks)
acceptance_criteria (testable conditions)
files_to_create, files_to_modify
tests_required (manual procedures)
references (Memory Bank docs)
notes (implementation hints)
```

### 2025-10-16: Memory Bank Initialization

**Decision**: Implement full Memory Bank structure for project continuity

**Rationale**:
- Project will evolve over multiple sessions
- Need persistent context between development sessions
- Multi-agent workflow requires shared knowledge base
- Best practices from claude.md guidance

**Implementation**:
- Created all core Memory Bank files
- Established task documentation pattern
- Set up monthly task organization (tasks/YYYY-MM/)

### 2025-10-16: Project Structure Analysis

**Context**: Received starter pack with basic documentation

**Existing Assets**:
- ARCHITECTURE.md - Mermaid diagram of system flow
- PRD.md - Product requirements and release roadmap
- SIGNAL_FLOW.md - Audio routing technical details
- docker-compose.yml - Infrastructure setup (Icecast + coturn)
- station-manifest.sample.json - Configuration template

**Next Steps**:
- Execute task 001: Project structure and dependencies
- Follow sequential implementation through all 20 tasks
- Mark tasks complete with X-marker as they finish

## Current Work Items

### Completed - Milestone 1: Foundation (Tasks 001-004) ✅

1. ✅ **Task 001**: Project structure and dependencies (COMPLETE)
   - Directory structure (server/, web/, shared/)
   - Package.json configuration with ES modules
   - Core dependency installation

2. ✅ **Task 002**: Docker infrastructure verification (COMPLETE)
   - Icecast operational (HTTP 200 at localhost:8000)
   - coturn operational (STUN port 3478 listening)
   - Signaling placeholder healthy

3. ✅ **Task 003**: Signaling server skeleton (COMPLETE)
   - WebSocket server operational on port 3000
   - Health check endpoint working (GET /health)
   - Ping/pong messaging validated
   - Graceful shutdown tested (SIGTERM)
   - Connection logging with client IPs

4. ✅ **Task 004**: Station manifest integration (COMPLETE)
   - Configuration loading and validation
   - API endpoint for station info (/api/station)
   - Fallback to sample manifest
   - Fail fast on invalid config

### In Progress - Milestone 2: Basic Connection (Tasks 005-008)

5. ✅ **Task 005**: WebSocket signaling protocol (COMPLETE)
   - Peer registration and tracking
   - SDP offer/answer relay
   - ICE candidate relay
   - Anti-spoofing validation
   - 9 automated tests (100% pass rate)

6. ✅ **Task 006**: Room management system (COMPLETE)
   - Room creation with UUID identifiers
   - Participant tracking (host/caller roles)
   - Join room with participant list
   - Peer-joined/peer-left broadcasts
   - Auto-cleanup when empty
   - 9 automated tests (100% pass rate)

7. ✅ **Task 007**: Web studio HTML/CSS scaffold (COMPLETE)
8. ✅ **Task 008**: First WebRTC peer connection (COMPLETE)

### In Progress - Milestone 3: Multi-Peer Audio (Tasks 009-013)

9. ✅ **Task 009**: Web Audio foundation (COMPLETE)
   - AudioContext singleton with lifecycle management
   - Audio graph: MediaStreamSource → Gain → Compressor → Destination
   - Browser autoplay policy compliance
   - Automated Playwright testing

10. **Task 010**: Gain controls per participant - NEXT
11. **Task 011**: Program bus mixing
12. **Task 012**: Audio quality testing
13. **Task 013**: Multi-peer stability

### Short Term - Milestone 4-5 (Tasks 014-020)

- **M4**: Mix-Minus (014-016) - Per-caller mixes, return feeds, testing
- **M5**: Production Ready (017-020) - Mute controls, Icecast, stability testing, docs

### Future Work (Post-MVP)

- DHT station directory (Release 0.2)
- Waiting room / call screening (Release 0.3)
- Multi-track recording (Release 0.4)

## Open Questions

### Technical

- **Q**: Should we use a bundler (Vite/Webpack) or pure ES modules for web client?
  - **Current Thinking**: Start with ES modules for simplicity, add bundler if needed

- **Q**: How to handle Safari's WebRTC quirks?
  - **Current Thinking**: Test thoroughly, document limitations, consider polyfills only if critical

- **Q**: What's the optimal Opus bitrate for mix-minus feeds?
  - **Current Thinking**: Start with 48kbps, make configurable, test subjective quality

### Product

- **Q**: Should MVP include text chat?
  - **Current Thinking**: No, focus on audio quality first; add in 0.3 with call screening

- **Q**: How to handle more than 15 participants (mesh network limit)?
  - **Current Thinking**: Document limitation for MVP, plan SFU mode for 0.4+

## Blockers

**None currently** - fresh project start

## Dependencies Waiting On

**None currently** - all infrastructure components exist (Docker images)

## Notes for Next Session

1. Review this file first to understand current state
2. Check tasks/2025-10/README.md for recent progress
3. **Start with task 010**: Read `memory-bank/releases/0.1/tasks/010_gain_controls.yml`
4. Infrastructure operational: Icecast (8000), coturn (3478), signaling server (3000 WebSocket + HTTP)
5. Signaling protocol ready: Peer registration, SDP/ICE relay, anti-spoofing validation working
6. Room management ready: Create room, join room, peer-joined/peer-left broadcasts, auto-cleanup
7. Web scaffold ready: HTML/CSS interface at web/index.html (415 lines: reset.css, studio.css, index.html)
8. WebRTC client ready: signaling-client.js, rtc-manager.js, main.js (1520 lines JS total)
9. **Web Audio foundation ready**: audio-context-manager.js, audio-graph.js (391 lines, routing infrastructure)
10. **Milestone 1 (Foundation) complete**: Project structure, Docker, signaling skeleton, configuration management
11. **Milestone 2 (Basic Connection) complete**: Signaling, room management, web scaffold, WebRTC peer connection
12. **Milestone 3 (Multi-Peer Audio) 25% complete**: Web Audio foundation ✅, gain controls next
13. Follow workflow: Read task YAML → Implement → Test → Mark complete with X
14. Reference systemPatterns.md for architectural decisions
15. Use `sudo docker compose` for all Docker commands (user not in docker group)
16. Port 3000 is standard for signaling server (documented in tasks 003-004)
17. Configuration available via GET /api/station (includes ICE servers for WebRTC)
18. Test suites: 9 signaling tests + 9 room tests + 2 Playwright tests = 20 automated tests, all passing
19. Web client runs via `python3 -m http.server 8086` from web/ directory
20. Two-browser peer connection working: create room, join room, SDP/ICE exchange, audio routes through Web Audio graph
21. Playwright automated testing validates WebRTC + Web Audio flow without manual intervention
22. Browser console debugging: `audioContextManager.getState()`, `audioGraph.getGraphInfo()`

## Context for Future Work

### Why Zero-Dependency Focus

This project exists to provide a self-hostable alternative to commercial SaaS platforms. Every dependency is a potential supply chain risk, maintenance burden, and barrier to self-hosting. We prefer minimal, audited libraries over feature-rich frameworks.

### Why Mix-Minus is Critical

Without mix-minus, callers hear themselves with network latency (echo/feedback). This is the #1 UX failure mode for virtual studios. Getting this right in the Web Audio graph is essential for MVP acceptance criteria.

### Why Distributed Directory Matters (But Not in MVP)

Centralized directories create single points of failure and censorship risk. DHT-based discovery aligns with self-hosting philosophy. However, it's complex and not needed for initial testing, so deferred to 0.2.

## Memory Bank Maintenance

This file should be updated:
- At the start of each major development session
- When architectural decisions are made
- When priorities shift
- When blockers arise or are resolved

Keep it concise. Move historical decisions to task documentation. This file should represent **right now**.
