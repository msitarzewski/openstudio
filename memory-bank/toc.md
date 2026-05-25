# Memory Bank - Table of Contents

## Core Memory Bank Files

1. **projectbrief.md** - Core vision and requirements
2. **productContext.md** - Why this exists and user goals
3. **systemPatterns.md** - Architecture and design patterns (updated with Power Move)
4. **techContext.md** - Tech stack and constraints (updated v0.3.1 — `archiver` dep, env-driven LLM, ffmpeg requirements)
5. **activeContext.md** - Current focus and decisions (updated v0.3.1 — MP3 + zip + LLM fixes shipped)
6. **progress.md** - What's working and what's next (updated v0.3.1 — Power Move Tasks 1-3 actually complete)
7. **projectRules.md** - Project-specific patterns and preferences (updated v0.3.1 — multipart parser, env-driven integrations, frontend fallback patterns)

## Reference Documentation

- **ARCHITECTURE.md** - System architecture and data flow diagrams
- **SIGNAL_FLOW.md** - Audio routing and mix-minus implementation

## External Documentation (in docs/)

- **docs/vision.md** - Full project vision and philosophy (original README)
- **docs/ARCHITECTURE-IMPLEMENTATION.md** - Implementation architecture details
- **docs/TROUBLESHOOTING.md** - Troubleshooting guide
- **docs/testing/** - Performance benchmarks and test protocols

## Release Plans

### Release 0.1 ✅ (Shipped 2026-03-12)
### Release 0.2 ✅ (Shipped 2026-03-13)
### Release 0.2.1 ✅ (Merged PR #1, 2026-03-14) — Security hardening
### Signal UX Redesign ✅ (Merged PR #7, 2026-03-14) — "Signal" design system
### Power Move ✅ (Merged PR #8, ~2026-05) — Whisper.cpp + audio cleaning pipeline
### Release 0.3.0 ✅ (2026-05-25) — Version bump, self-hosted fonts, header status fix
### Release 0.3.1 ✅ (2026-05-25) — MP3 fix, zip bundle endpoint, configurable LLM, README rewrite

## Task Directories

- **tasks/2025-10/** — Release 0.1 task breakdown (tasks 001–019)
- **tasks/2026-03/** — Signal UX redesign
- **tasks/2026-05/** — Power Move, v0.3.0 release cut, v0.3.1 fixes

## Quick References

- **quick-start.md** - Common patterns and session data
- **activeContext.md** — Current branch status, recent decisions, architecture
