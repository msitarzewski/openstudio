# Active Context: OpenStudio

**Last Updated**: 2025-10-16

## Current Phase

**Release**: 0.1 MVP (Core Loop)
**Status**: Planning Complete → Ready for Implementation
**Focus**: Executing Release 0.1 task breakdown (20 tasks, 5 milestones)

## Recent Decisions

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

### Immediate - Milestone 1: Foundation (Tasks 001-004)

1. **Task 001**: Project structure and dependencies
   - Directory structure (server/, web/, shared/)
   - Package.json configuration with ES modules
   - Core dependency installation

2. **Task 002**: Docker infrastructure verification
   - Verify Icecast and coturn start successfully
   - Test connectivity and configuration

3. **Task 003**: Signaling server skeleton
   - WebSocket server basic connectivity
   - Health check endpoint
   - Ping/pong messaging

4. **Task 004**: Station manifest integration
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
3. **Start with task 001**: Read `memory-bank/releases/0.1/tasks/001_project_structure.yml`
4. Follow workflow: Read task YAML → Implement → Test → Mark complete with X
5. Reference systemPatterns.md for architectural decisions
6. Follow PM → Dev → QA → PM workflow for complex implementation tasks

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
