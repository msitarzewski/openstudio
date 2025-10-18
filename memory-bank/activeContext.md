# Active Context: OpenStudio

**Last Updated**: 2025-10-18

## Current Phase

**Release**: 0.1 MVP (Core Loop)
**Status**: Implementation In Progress (6/20 tasks complete, 30%)
**Focus**: Milestone 2 - Basic Connection (50% complete: tasks 005-006 done, tasks 007-008 pending)

## Recent Decisions

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

7. **Task 007**: Web studio HTML/CSS scaffold - NEXT
8. **Task 008**: First WebRTC peer connection test

### Short Term - Milestone 3-5 (Tasks 009-020)

- **M3**: Multi-Peer Audio (009-013) - Web Audio graph, gain controls, program bus
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
3. **Start with task 007**: Read `memory-bank/releases/0.1/tasks/007_web_studio_scaffold.yml`
4. Infrastructure operational: Icecast (8000), coturn (3478), signaling server (3000 WebSocket + HTTP)
5. Signaling protocol ready: Peer registration, SDP/ICE relay, anti-spoofing validation working
6. Room management ready: Create room, join room, peer-joined/peer-left broadcasts, auto-cleanup
7. **Milestone 1 (Foundation) complete**: Project structure, Docker, signaling skeleton, configuration management
8. **Milestone 2 (Basic Connection) 50% complete**: Signaling and room management done, web scaffold next
9. Follow workflow: Read task YAML → Implement → Test → Mark complete with X
10. Reference systemPatterns.md for architectural decisions
11. Use `sudo docker compose` for all Docker commands (user not in docker group)
12. Port 3000 is standard for signaling server (documented in tasks 003-004)
13. Configuration available via GET /api/station (includes ICE servers for WebRTC)
14. Test suites: 9 signaling tests + 9 room tests = 18 automated tests, all passing

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
