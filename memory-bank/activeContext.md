# Active Context: OpenStudio

**Last Updated**: 2025-10-18

## Current Phase

**Release**: 0.1 MVP (Core Loop)
**Status**: Implementation In Progress (3/20 tasks complete, 15%)
**Focus**: Milestone 1 - Foundation (75% complete: tasks 001-003 done, 004 remaining)

## Recent Decisions

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

### Immediate - Milestone 1: Foundation (Tasks 003-004)

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

4. **Task 004**: Station manifest integration (NEXT)
   - Configuration loading and validation
   - API endpoint for station info

### Short Term - Milestone 2: Basic Connection (Tasks 005-008)

5. **Task 005**: WebSocket signaling protocol (SDP/ICE relay)
6. **Task 006**: Room management system
7. **Task 007**: Web studio HTML/CSS scaffold
8. **Task 008**: First WebRTC peer connection test

### Medium Term - Milestone 3-5 (Tasks 009-020)

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
3. **Start with task 004**: Read `memory-bank/releases/0.1/tasks/004_station_manifest_integration.yml`
4. Infrastructure operational: Icecast (8000), coturn (3478), signaling server (3000 WebSocket + HTTP)
5. Signaling server ready: WebSocket accepts connections, ping/pong works, health check operational
6. Follow workflow: Read task YAML → Implement → Test → Mark complete with X
7. Reference systemPatterns.md for architectural decisions
8. Use `sudo docker compose` for all Docker commands (user not in docker group)
9. Port 3000 is standard for signaling server (documented in task 003 and 004)

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
