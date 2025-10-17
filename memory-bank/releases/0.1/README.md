# Release 0.1 - Core Loop MVP

This directory contains the complete task breakdown for OpenStudio Release 0.1.

## Overview

**Goal**: Build a functional multi-host virtual studio with live callers, mix-minus audio routing, and Icecast streaming output.

**Status**: Ready to start (0/20 tasks complete)

**Estimated Effort**: 80-120 hours total

---

## Quick Reference

### File Structure

```
memory-bank/releases/0.1/
├── release.yml              # Release overview and acceptance criteria
├── README.md               # This file
└── tasks/
    ├── 001_project_structure.yml
    ├── 002_docker_verification.yml
    ├── ...
    └── 020_documentation_deployment.yml
```

### Task Naming Convention

**Pending task:**
```
001_project_structure.yml
```

**Completed task (marked with X):**
```
001_X_project_structure.yml
```

Rename tasks to mark them complete. Visual progress tracking!

---

## Milestones

### Milestone 1: Foundation (Tasks 001-004)
**Goal**: Project structure, Docker verified, signaling server skeleton

- [x] 001: Set up project structure and dependencies
- [x] 002: Verify Docker infrastructure setup
- [x] 003: Create signaling server skeleton
- [x] 004: Integrate station manifest configuration

### Milestone 2: Basic Connection (Tasks 005-008)
**Goal**: Two peers can connect via WebRTC and exchange audio

- [x] 005: Implement WebSocket signaling protocol
- [x] 006: Implement room management system
- [x] 007: Create web studio HTML/CSS scaffold
- [x] 008: Test first WebRTC peer connection

### Milestone 3: Multi-Peer Audio (Tasks 009-013)
**Goal**: Multiple participants mixed into program bus

- [x] 009: Set up Web Audio API foundation
- [x] 010: Create MediaStream source nodes per peer
- [x] 011: Implement per-participant gain controls
- [x] 012: Implement program bus routing
- [x] 013: Test and refine multi-peer support

### Milestone 4: Mix-Minus (Tasks 014-016)
**Goal**: Callers hear everyone except themselves (no echo)

- [x] 014: Implement mix-minus calculation logic
- [x] 015: Route mix-minus as return feed to peers
- [x] 016: Test mix-minus with multiple callers

### Milestone 5: Production Ready (Tasks 017-020)
**Goal**: Mute controls, Icecast output, tested and documented

- [x] 017: Implement mute/unmute controls
- [x] 018: Integrate Icecast streaming output
- [x] 019: Conduct stability and performance testing
- [x] 020: Complete documentation and deployment guide

**Note**: Checkboxes above will be updated as you rename task files with the X marker.

---

## Workflow

### Starting a Task

1. **Pick the next task** (start with 001, proceed sequentially)
2. **Read the YAML file** thoroughly
3. **Start a new session** with Claude Code
4. **Send the task**: "Please implement task 001 from Release 0.1"

### During Implementation

Claude will:
- Read the task YAML
- Create/modify files as specified
- Run tests
- Follow acceptance criteria
- Update Memory Bank if needed

### Completing a Task

1. **Review the implementation** carefully
2. **Test manually** (follow tests_required)
3. **Verify acceptance criteria** all met
4. **Rename the file** to mark complete:
   ```bash
   cd memory-bank/releases/0.1/tasks/
   mv 001_project_structure.yml 001_X_project_structure.yml
   ```
5. **Commit changes** (optional but recommended)
6. **Move to next task**

---

## Task Dependencies

Most tasks depend on previous tasks within their milestone. You can:

- **Work sequentially**: Complete 001 → 002 → 003 → ... → 020
- **Parallelize milestones**: Work on M1-M2 (backend) and M3 (frontend) simultaneously if you have multiple sessions
- **Skip ahead cautiously**: Check `depends_on` field in task YAML

**Recommended**: Sequential execution for first-time implementation.

---

## Progress Tracking

### Visual Method
Look at the `tasks/` directory:
```
001_X_project_structure.yml          ✅ Done
002_X_docker_verification.yml        ✅ Done
003_signaling_server_skeleton.yml    ⏳ Next
004_station_manifest_integration.yml ⏸️ Pending
...
```

### Programmatic Method
```bash
# Count completed tasks
ls tasks/*_X_*.yml 2>/dev/null | wc -l

# Count pending tasks
ls tasks/[0-9][0-9][0-9]_[^X]*.yml 2>/dev/null | wc -l
```

### Memory Bank Method
Update `memory-bank/progress.md` after each milestone.

---

## Task Format

Each task YAML contains:

```yaml
id: "001"
title: "Short, action-oriented title"
component: "backend|frontend|infrastructure|integration"
estimated_hours: 2-6

context: |
  Why this task exists and how it fits into the bigger picture.

depends_on: ["000"]  # Array of prerequisite task IDs

acceptance_criteria:
  - Specific, testable condition 1
  - Specific, testable condition 2

files_to_create:
  - path/to/new/file.js

files_to_modify:
  - path/to/existing/file.js

tests_required:
  - "Manual: Test description with expected outcome"

references:
  - memory-bank/file.md (section name)

notes: |
  Implementation hints, patterns, and gotchas.
```

---

## Success Criteria

Release 0.1 is complete when:

- ✅ All 20 tasks marked with X
- ✅ All acceptance criteria from `release.yml` verified
- ✅ 60-minute stability test passed
- ✅ Documentation complete and tested
- ✅ GitHub release v0.1.0 published

---

## Tips

### For Efficient Execution

1. **Read the context**: Understanding the "why" helps with implementation decisions
2. **Follow the notes**: Implementation hints save time and prevent common mistakes
3. **Test thoroughly**: Acceptance criteria are your checklist
4. **Update Memory Bank**: After completing milestones, update `activeContext.md` and `progress.md`

### For Quality Results

1. **Don't skip tests**: Manual testing is critical for WebRTC
2. **Reference Memory Bank docs**: They contain architectural decisions
3. **Follow project rules**: See `memory-bank/projectRules.md` for standards
4. **Use multi-agent workflow**: Complex tasks benefit from Planning → Dev → QA → PM pattern

### For Troubleshooting

1. **Check dependencies**: Ensure prerequisite tasks are complete
2. **Review references**: Memory Bank docs have detailed explanations
3. **Use browser tools**: chrome://webrtc-internals is essential for debugging
4. **Ask questions**: If task is unclear, ask Claude to clarify before starting

---

## Next Steps

**Ready to start?**

1. Read `release.yml` to understand the big picture
2. Open `tasks/001_project_structure.yml`
3. Start a Claude Code session
4. Say: "Please implement task 001 from Release 0.1"

**Let's build OpenStudio!** 🎙️

---

## Notes

- Tasks are designed for 2-6 hours of focused work each
- Total estimated: 80-120 hours (varies by experience)
- Some tasks may be completed faster, others may need breakdown
- If a task takes >8 hours, consider splitting it

This is an MVP. Perfectionism is the enemy of shipping. Focus on:
- ✅ Working functionality
- ✅ Meeting acceptance criteria
- ✅ Clean, maintainable code
- ❌ Premature optimization
- ❌ Gold-plating features
- ❌ Analysis paralysis

Ship 0.1, learn from users, iterate in 0.2+.

---

**Last Updated**: 2025-10-16
