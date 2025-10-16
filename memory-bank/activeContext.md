# Active Context: OpenStudio

**Last Updated**: 2025-10-16

## Current Phase

**Release**: 0.1 MVP (Core Loop)
**Status**: Initialization
**Focus**: Setting up project structure and Memory Bank system

## Recent Decisions

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
- Implement signaling server
- Build web studio client
- Test basic WebRTC connection flow

## Current Work Items

### High Priority

1. **Signaling Server** (Release 0.1)
   - WebSocket server implementation
   - Room management
   - SDP exchange coordination
   - ICE candidate relay

2. **Web Studio Client** (Release 0.1)
   - Basic UI for host controls
   - WebRTC peer connection setup
   - Web Audio graph construction
   - Program bus routing

3. **Mix-Minus Implementation** (Release 0.1)
   - Per-caller audio graph calculation
   - Return feed routing
   - Test with multiple participants

### Medium Priority

4. **Icecast Integration** (Release 0.1)
   - MediaRecorder → encoder pipeline
   - Mount point configuration
   - Reconnection logic

5. **Mute/Unmute Controls** (Release 0.1)
   - UI controls
   - Signaling propagation
   - Gain node manipulation

### Future Work (Post-MVP)

- DHT station directory (0.2)
- Waiting room / call screening (0.3)
- Multi-track recording (0.4)

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
3. Reference systemPatterns.md for architectural decisions
4. Follow PM → Dev → QA → PM workflow for implementation tasks

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
