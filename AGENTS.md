# AGENTS.md

**Version**: 2.1 (2025-10-25) | **Compatibility**: Claude, Cursor, Copilot, Cline, Aider, all AGENTS.md-compatible tools
**Status**: Canonical single-file guide for AI-assisted development

---

## Table of Contents

1. [Compliance & Core Rules](#1-compliance--core-rules)
2. [Session Startup](#2-session-startup)
3. [Memory Bank](#3-memory-bank)
4. [State Machine](#4-state-machine)
5. [Task Contract & Budgets](#5-task-contract--budgets)
6. [Quality & Documentation](#6-quality--documentation)
7. [Example Workflow](#7-example-workflow)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Compliance & Core Rules

### Startup Compliance (Output Every Session)

```
COMPLIANCE CONFIRMED: Reuse over creation

⚠️  GIGO PREVENTION - User Responsibilities:
📋 Clear task objectives | 🔗 Historical context | 🎯 Success criteria
⚙️  Architectural constraints | 🎖️ You lead - clear input = excellent output

[Continue with Memory Bank loading...]
```

### The Four Sacred Rules

| Rule | Requirement | Validation |
|------|-------------|------------|
| ❌ **No new files without reuse analysis** | Search codebase, reference files that cannot be extended, provide exhaustive justification | Before creating: "Analyzed X, Y, Z. Cannot extend because [technical reason]" |
| ❌ **No rewrites when refactoring possible** | Prefer incremental improvements, justify why refactoring won't work | "Refactoring X impossible because [specific limitation]" |
| ❌ **No generic advice** | Cite `file:line`, show concrete integration points, include migration strategies | Every suggestion includes `file:line` citation |
| ❌ **No ignoring existing architecture** | Load patterns before changes, extend existing services/components, consolidate duplicates | "Extends existing pattern at `file:line`" |

### Reuse Validation Checklist (Before Creating Files)

```markdown
- [ ] Searched: [search terms] → found: [list files]
- [ ] Analyzed extension:
  - [ ] `existing/file1.ext` - Cannot extend: [specific technical reason]
  - [ ] `existing/file2.ext` - Cannot extend: [specific technical reason]
- [ ] Checked patterns: `systemPatterns.md#[section]`
- [ ] Justification: New file needed because [exhaustive reasoning]
```

### Non-Negotiables

- **Approval Gates**: No file changes without explicit user approval
- **Citations**: Always `file:line` for code, `file.md#Section` for Memory Bank
- **Sandbox First**: All edits in branch/temp clone, never main
- **MCP Preferred**: Use MCP servers for memory, repo ops, QA over brute-force context
- **No Mock Data**: Never fake/simulated data in production; never stub functions
- **Context Engineering**: Keep working context focused on current task

---

## 2. Session Startup

### Load Priority (Choose Based on Task Complexity)

**Every Session** (mandatory):
1. Output compliance statement (Section 1)
2. Attach MCP servers: Read `.brain/mcp.config.json` or `.mcp.json` if present
3. Load Memory Bank per mode below
4. Log session: `{"ts":"2025-10-25T10:30Z","mode":"fast|standard|deep","mb_v":"2024-10"}`

**Fast Track** (bug fixes, small changes):
```
- [ ] Load current month README: `memory-bank/tasks/YYYY-MM/README.md`
- [ ] Check recent achievements and next priorities
- [ ] Load `quick-start.md` if needed
```

**Standard Discovery** (features, tests, quality-critical work):
```
- [ ] Current month README
- [ ] Core files: projectbrief.md, systemPatterns.md, techContext.md, activeContext.md, progress.md
- [ ] Scan docs/ for recent updates
- [ ] Scan root for instructions.md, ai_instructions.md
- [ ] Verify toc.md and activeContext.md current
```

**Deep Dive** (architecture, legacy investigation):
```
- [ ] Standard Discovery files
- [ ] Specific month README when investigating legacy
- [ ] decisions.md for architectural context
- [ ] Cross-reference with current work patterns
```

### Session Logging (Operational Log - Separate from Memory Bank)

Append-only JSONL format:
```json
{"timestamp":"2025-10-25T10:30:00Z","session_id":"uuid","mode":"standard","mb_version":"2024-10"}
{"timestamp":"2025-10-25T10:35:00Z","session_id":"uuid","event":"state_transition","from":"PLAN","to":"BUILD"}
{"timestamp":"2025-10-25T11:00:00Z","session_id":"uuid","event":"approval_requested","state":"APPROVAL"}
```

---

## 3. Memory Bank

### Structure

```
memory-bank/
├── toc.md                    # Index (update after new files/tasks)
├── projectbrief.md           # Vision, goals (rarely change)
├── productContext.md         # User goals, market (quarterly)
├── systemPatterns.md         # Architecture (pattern discovery)
├── techContext.md            # Tech stack (new tech adoption)
├── activeContext.md          # Current sprint (weekly/milestone)
├── progress.md               # Status, blockers (major features)
├── projectRules.md           # Coding standards (new patterns)
├── decisions.md              # ADRs (architectural decisions)
├── quick-start.md            # Common patterns, session data
├── database-schema.md        # Data models (if applicable)
├── build-deployment.md       # Build/deploy procedures
├── testing-patterns.md       # Test strategies
└── tasks/
    ├── YYYY-MM/
    │   ├── README.md         # Monthly summary (month end)
    │   └── DDMMDD_*.md       # Task docs (after approval)
    └── YYYY-MM/README.md
```

### File Reference Table

| File | Purpose | Load When | Update When |
|------|---------|-----------|-------------|
| `toc.md` | Index/navigation | After adding files | After new files/tasks |
| `projectbrief.md` | Core requirements | Complex tasks | Major pivots |
| `productContext.md` | User goals, market | Complex tasks | Quarterly/strategy shifts |
| `systemPatterns.md` | Architecture patterns | Before arch changes | Pattern discovery |
| `techContext.md` | Tech stack decisions | Session start | New tech adoption |
| `activeContext.md` | Current focus | Every session | Weekly/milestones |
| `progress.md` | Current state | Session start | Major features done |
| `projectRules.md` | Coding standards | When uncertain | New patterns emerge |
| `decisions.md` | Why X over Y | Arch decisions | Arch decisions made |
| `tasks/*/README.md` | Monthly summary | Month-specific work | Month end/milestone |
| `tasks/*/*.md` | Task documentation | Investigating issues | After approval only |

### Read vs Write Paths

**Read** (frequent): Session startup, before arch decisions, when uncertain, investigating issues
**Write** (infrequent, requires approval): After major features, pattern discovery, arch decisions, milestone completion, user requests

---

## 4. State Machine

### Overview

**States**: `PLAN → BUILD → DIFF → QA → APPROVAL → APPLY → DOCS`
**Substates**: `CODING` (building), `WAITING_TOOL` (permissions), `RUNNING` (QA), `IDLE`

```
PLAN [approve] → BUILD → DIFF → QA [pass] → APPROVAL [approve] → APPLY → DOCS → END
  ↑               ↑______↓______↓_____[fail/changes]______________↓
  └───────────────────────────────────[major changes needed]─────┘
```

---

### PLAN

**In**: Task contract + MB context | **Out**: Implementation plan | **Exit**: User approves

**Required Content**:
```markdown
## Plan: [Task Name]

**Analyzed**:
- `path/file.ext:50-100` - Current implementation of X
- `memory-bank/systemPatterns.md#Pattern` - Established pattern for Y
- `path/service.ext` - Service handling Z

**Reuse Strategy**:
- Extend `file.ext` - Add method for [functionality]
- Integrate `service.ext:line` - New behavior at [point]
- Cannot reuse [component] because: [specific technical reason]

**Steps**:
1. [Action] - extends pattern at `file:line`
2. [Action] - integrates with [component]
3. [Action] - adds tests mirroring `test.ext`

**Integration**: [Component A] calls via [method] | [Service B] update at `file:line`
**Risks**: [Risk] → mitigation: [approach]
**Tests**: Unit: [scenarios] | Integration: [flows] | Manual: [paths]
```

**Exit**: User responds "approved", "proceed", "looks good"
**Failures**: Insufficient reuse → load more MB | Ambiguous → ask user | Rejected → iterate

---

### BUILD

**In**: Approved plan | **Out**: Proposed diff (NOT APPLIED) | **Exit**: All changes complete, diff generated

**Substate**: Set to `CODING`

**Actions**:
1. Work in branch/temp clone (never main)
2. Create/modify files per approved plan
3. Implement minimal changes achieving objective
4. Follow patterns from `projectRules.md`
5. Add tests alongside implementation
6. Generate unified diff
7. **DO NOT APPLY**

**Context Management**:
- Keep only task-relevant files in working context
- Reference MB as needed, don't load entire codebase
- Focused search/grep for patterns
- Parallelize independent file operations

**Agentic Primitives** (reusable building blocks):
- Extend class/module following established patterns
- Integrate component at defined integration points
- Add test coverage mirroring existing test structure
- Update config following existing patterns
- Add error handling using project's patterns

**Exit**: All planned changes done, tests written, no syntax errors, diff generated, **NOT APPLIED**
**Failures**: Compilation errors → fix, stay in BUILD | Pattern violations → review `projectRules.md` | Integration conflicts → review `systemPatterns.md` | Two identical diffs → STALL DETECTED

---

### DIFF

**In**: BUILD complete | **Out**: Rationale + diff | **Exit**: Ready for QA

**Present**:
```markdown
## Proposed Changes

**Files**:
```
path/file1.ext    | 50 +++++++++---------
path/file2.ext    | 120 +++++++++++++++++++
tests/test.ext    | 200 +++++++++++++++++++++++++++
3 files, 370 insertions(+), 10 deletions(-)
```

**Diff**: [unified diff output]

**Rationale**:
- Modified `file1.ext` to extend per `systemPatterns.md#Pattern`
- Created `file2.ext` because [specific technical reason]
- Tests follow pattern from `existing_test.ext`

**Integration**: `component.ext:45` calls new method | `service.ext:120` updated | No breaking API changes

**MB References**: `systemPatterns.md#Architecture` | `decisions.md#2025-09-15-strategy`
```

**Exit**: Changes presented with rationale, MB references, new file justification (if any)
**Failures**: Cannot justify new file → return to BUILD, refactor | Missing MB refs → add explicit refs | Unclear integration → clarify

---

### QA

**In**: DIFF complete | **Out**: Structured test results | **Exit**: Tests pass OR user waiver

**Substate**: Set to `RUNNING`

**Execute**:
1. Test suite (via MCP or project command)
2. Linters and code quality checks
3. Coverage checks
4. Build verification
5. Report structured results

**Report Format**:
```markdown
## QA Results

**Tests**: ✅ PASS | ❌ FAIL | Total: 145 | Passed: 145 | Failed: 0 | Duration: 23.5s
**Linter**: ✅ PASS | ⚠️  WARNINGS | ❌ FAIL | Errors: 0 | Warnings: 2 (non-blocking)
**Coverage**: Overall: 87.3% (+2.1%) | New code: 95.2% | Below threshold: None
**Build**: ✅ SUCCESS | ❌ FAILURE | Duration: 12.3s

**Verdict**: ✅ Ready for APPROVAL | ❌ Return to BUILD
```

**Exit (PASS)**: All tests passing, no lint errors (warnings OK with justification), coverage meets threshold, build succeeds
**Exit (CONDITIONAL)**: Tests fail with documented waiver OR user grants waiver

**Failures**: Tests fail → synthesize minimal patch, return to BUILD | Lint errors → fix, retry | Build fails → diagnose, return to BUILD

**Retry Protocol**:
- 1st fail: Analyze output, minimal fix, re-test
- 2nd fail: Re-analyze approach, check environment, fix, re-test
- 3rd fail: **STALL DETECTED** → request user input or agent swap

---

### APPROVAL (HUMAN GATE)

**In**: QA passed | **Out**: User decision | **Exit**: User approves explicitly

**Present**:
```markdown
## Ready for Approval

Code changes complete. Ready for review.

**Files modified**:
- `path/file1.ext` (+50, -10 lines)
- `path/file2.ext` (+120, -5 lines)
- `tests/test.ext` (+200, -0 lines)

**Git diff**: [git diff --stat if in repo]

**Test Results**:
✅ 145 tests passing | ✅ Linter clean | ✅ Coverage: 87.3% (+2.1%) | ✅ Build successful

**Review Gates**:
- ✅ Tests pass
- ✅ Security reviewed (no sensitive data, validated inputs, safe errors, follows auth patterns)
- ✅ Linter clean
- ✅ Documentation plan: Will create `tasks/2025-10/251025_task-name.md` + update monthly README

**Next Steps After Approval**:
1. Apply changes to sandbox branch
2. Create task documentation
3. Update monthly README
4. Update relevant MB files (if applicable)

---

**Please review. Reply with**:
- "approved" | "looks good" | "document it" → Proceed to APPLY
- "change X" | "fix Y" → Return to BUILD with changes
- "revert" → Discard all changes
```

**Exit**: User responds with approval keywords: "approved", "looks good", "document it", "apply it", "ship it"
**Alternative Paths**: User requests changes → BUILD | User requests revert → discard, return to START | User requests info → provide details, stay in APPROVAL
**Failures**: Ambiguous response → ask for explicit approval | Approval without gates passing → warn, request waiver | Long wait → stay IDLE, do not proceed

---

### APPLY

**In**: User approved | **Out**: Changes applied or rollback | **Exit**: Applied successfully OR rolled back

**Actions**:
1. Apply all proposed changes to sandbox branch
2. Verify application successful
3. Optional: Quick smoke test
4. Report success or initiate rollback

**Success**:
```markdown
## Changes Applied

✅ All changes applied to sandbox branch
✅ 3 files modified
✅ Quick verification passed

Ready for DOCS.
```

**Failure**:
```markdown
## Apply Failed - Rolling Back

❌ Failed: [error]
🔄 Rolling back to previous state
📝 Sandbox restored

Diagnosis: [technical reason]
Recommendation: [fix or alternative]

Returning to BUILD.
```

**Exit (Success)**: All changes applied, sandbox updated, optional smoke test passed
**Exit (Failure)**: Rollback complete, sandbox restored, error diagnosed
**Failures**: File conflicts → resolve, retry | Permission errors → check perms, retry | Verification fail → rollback, return to BUILD | Rollback fails → **CRITICAL** → user intervention

---

### DOCS

**In**: APPLY succeeded + user approved code | **Out**: Task docs, MB updates | **Exit**: All docs complete

**CRITICAL**: Only enter after user approved code changes (from APPROVAL state)

**Create**:
1. Task doc: `memory-bank/tasks/YYYY-MM/DDMMDD_task-name.md`
2. Update monthly README: `memory-bank/tasks/YYYY-MM/README.md`
3. Update `projectRules.md` if new patterns
4. Update `decisions.md` if arch decisions
5. Update `toc.md` if new MB files
6. Open documentation PR (or commit if user prefers)

**Task Doc Template**:
```markdown
# YYMMDD_task-name

## Objective
[What was accomplished]

## Outcome
- ✅ Tests: 145 passing (+10 new)
- ✅ Coverage: 87.3% (+2.1%)
- ✅ Build: Successful
- ✅ Review: Approved

## Files Modified
- `file1.ext` - Added [functionality]
- `file2.ext` - Extended [service] for [scenario]
- `tests/test.ext` - Tests for [functionality]

## Patterns Applied
- `systemPatterns.md#Pattern`
- Updated `projectRules.md#ErrorHandling` (added: log at integration boundaries)

## Integration Points
- `component.ext:45` via new method
- `service.ext:120` updated for new data flow

## Architectural Decisions
- Decision: Event-driven for async updates
- Rationale: Loose coupling per `decisions.md#2025-09-01-event-driven`
- Trade-offs: Higher complexity, better scalability

## Artifacts
- PR: [link]
- Diff: [link]
```

**Monthly README Update**:
```markdown
## Tasks Completed

### 2025-10-25: [Task Name]
- Implemented [brief description]
- Files: `file1.ext`, `file2.ext`
- Pattern: Extended [existing pattern]
- See: [251025_task-name.md](./251025_task-name.md)
```

**MB Updates**:

`projectRules.md`:
```markdown
### [New Pattern]
**Context**: Discovered during [task]
**Pattern**: [description]
**Implementation**: [how to apply]
**Example**: `file.ext:line-range`
```

`decisions.md`:
```markdown
### YYYY-MM-DD: [Decision]
**Status**: Approved
**Context**: [why needed]
**Decision**: [what decided]
**Alternatives**: [other options, why not]
**Consequences**: [positive/negative outcomes]
**References**: `tasks/YYYY-MM/DDMMDD_task-name.md`
```

**Exit**: Task doc created, monthly README updated, relevant MB files updated, docs PR opened
**Failures**: Template violations → correct format | Missing references → add explicit refs | Incomplete updates → ensure all MB files updated

---

## 5. Task Contract & Budgets

### Task Contract Format

```markdown
## Task: [Clear, specific objective]

### Context
- **Repository**: [path or monorepo location]
- **Related Work**: [prior tasks, MB entries]
- **Constraints**: [arch rules, security, performance]
- **Affected Systems**: [components, services, modules]

### Expected Outcomes
- **Acceptance Criteria**:
  1. [Specific, testable criterion]
  2. [Specific, testable criterion]
- **Success Metrics**: [how to measure completion]
- **Definition of Done**: [when truly complete]

### Historical Reference
- **Prior Tasks**: [links to `tasks/YYYY-MM/DDMMDD_*.md`]
- **Arch Decisions**: [links to `decisions.md` entries]
- **Related Patterns**: [refs to `systemPatterns.md`, `projectRules.md`]

### Architectural Constraints
- **Must Follow**: [specific patterns from MB]
- **Must Extend**: [specific existing files]
- **Must Not**: [anti-patterns, approaches to avoid]
- **Security**: [specific security considerations]

### Instructions
Create outline for approval. After approval, do work. Do not document until I approve completion.
```

### Budget System

**Budget Types**:
- **Cycles**: Max BUILD → QA iterations (default: 3)
- **Tokens**: Max context tokens (default: agent-specific limits)
- **Minutes**: Max wall-clock time (default: 30 min for standard tasks)

**Tracking**:
```json
{
  "task_id": "251025_task",
  "budgets": {
    "cycles": {"allocated": 3, "consumed": 1, "remaining": 2},
    "tokens": {"allocated": 100000, "consumed": 45000, "remaining": 55000},
    "minutes": {"allocated": 30, "consumed": 12, "remaining": 18}
  },
  "status": "within_budget"
}
```

**Budget Exceeded Actions**:
- Cycles exceeded → STALL DETECTED → user intervention
- Tokens exceeded → minimal context mode or agent swap
- Minutes exceeded → present progress, request extension

**Extension**: User approval only. Request with: current progress, reason for overrun, estimated additional resources, alternatives

### Stall Detection

**Condition**: Two consecutive identical diffs (same files, same changes)

**Response**:
```markdown
## STALL DETECTED

⚠️  Two identical diffs - unable to progress

**Diagnosis**:
- Cause: [specific technical reason]
- Attempted: [what was tried]
- Blocker: [what prevents progress]

**Recommendations**:
1. More Context: Load [specific MB files/codebase areas]
2. Alternative: [different technical strategy]
3. Agent Swap: Switch to [specialized agent] for subtask

**Request**: Provide direction or choose recommendation

**Budgets**: Cycles: 3/3 ⚠️ | Tokens: 85K/100K | Minutes: 28/30 ⚠️
```

### Context Management

**Context Zones**:
1. **Core** (always): Task contract, relevant MB files, current state
2. **Task** (current task): Files being modified, direct dependencies, related tests
3. **Reference** (on-demand): Arch patterns, similar implementations, historical decisions

**Context Rotation**: After each state transition, drop Task Context, reload only what's needed for next state. Keep Core Context persistent.

**Parallel Execution**:
```
Task decomposition:
1. [Independent A] - parallel
2. [Independent B] - parallel
3. [Dependent C] - requires A+B

Execution: Spawn parallel agents for A+B with focused context → Wait → Execute C with results
```

---

## 6. Quality & Documentation

### Absolute Prohibitions

| Prohibition | Consequence |
|-------------|-------------|
| ❌ No fake/simulated/mock data in production code | Rollback + restart |
| ❌ No stubbed functions marked complete | Rollback + restart |
| ❌ No ignoring test failures | Rollback + restart |
| ❌ No "defensive programming" (fix root cause) | Rollback + restart |
| ❌ No applying changes without approval | Rollback + restart |

Test fixtures and test mocks are acceptable. Production fake data is never acceptable.

### Code Reuse Enforcement

**Before creating any new file**:
1. Search codebase for similar functionality
2. Check `systemPatterns.md` for patterns
3. Review existing architecture for extension points
4. Document why extension impossible (if claiming so)

**Validation** (see Section 1 checklist)

### Security Review (Part of APPROVAL State)

**Checklist**:
- [ ] **Auth/Authz**: No hardcoded creds | Auth checked before sensitive ops | Authz at boundaries | Session mgmt follows patterns
- [ ] **Data Handling**: Input validation on external data | Output encoding prevents injection | Sensitive data encrypted (rest/transit if applicable)
- [ ] **Error Handling**: No sensitive data in errors | Errors logged appropriately | Graceful degradation
- [ ] **Dependencies**: No known vulnerabilities | Versions pinned | Licenses compatible

If any item fails, address before APPROVAL state.

### Linting & Code Quality

**Requirements**: Zero errors before APPROVAL | Warnings OK with justification | Follow project's linting rules

**Standards**: Language idioms | Consistent naming (from `projectRules.md`) | Single-purpose functions | Max 3-4 nesting levels | Comment complex logic only

### Testing Requirements

**Coverage**: Unit tests for all new functions | Integration tests for workflows | Edge case coverage for critical paths | Clear test names

**Quality**: Deterministic (no flaky tests) | Independent (no shared state) | Fast (optimize slow tests) | Maintainable (clear, readable)

### Documentation Standards

**Files Requiring Approval Before Creation**:
- Any `memory-bank/tasks/*/` files (task docs)
- Updates to `memory-bank/tasks/*/README.md` (monthly summaries)
- Updates to `memory-bank/decisions.md` (ADRs)
- Updates to `memory-bank/projectRules.md` (patterns)
- Any commits to version control

**Files NOT Requiring Approval**: App code, tests, config updates, operational logs

**Approval Gate Workflow**:
1. Complete code changes (BUILD → DIFF → QA)
2. Present in APPROVAL state
3. **WAIT** for user response
4. If approved: APPLY → DOCS
5. If changes requested: BUILD
6. If reverted: discard all

**Citation Formats**:
- Code: `path/file.ext:42` (single line) | `path/file.ext:42-58` (range) | `path/file.ext:functionName()` (function)
- MB: `memory-bank/systemPatterns.md#Section` | `memory-bank/decisions.md#2025-10-15-decision` | `memory-bank/tasks/2025-10/251025_task.md`
- Always include context: ✅ "Extended `services/auth.ext:45` following `systemPatterns.md#Service Extension Pattern`" | ❌ "Updated service per systemPatterns.md"

**When to Update MB**:
- ✅ Completing major features (update `progress.md`)
- ✅ Discovering new patterns (update `systemPatterns.md`, `projectRules.md`)
- ✅ Making arch decisions (update `decisions.md`)
- ✅ User explicitly requests: "update memory bank"
- ✅ Milestone completion (update monthly README)
- ❌ Minor bug fixes (task doc only)
- ❌ Code formatting (no doc needed)
- ❌ Dependency updates (task doc only)
- ❌ Routine maintenance (task doc only)

### Versioning & Rollback

**Version Management**: Do not invent release/milestone IDs. If new milestone needed, output Proposal block for user to assign ID.

**Rollback Triggers**: APPLY fails | User requests revert | Critical error | Security vulnerability

**Rollback Protocol**:
1. Identify last known good state
2. Restore all files to that state
3. Verify rollback successful
4. Log rollback in operational log
5. Report to user: reason, reverted changes, current state, recommendation

---

## 7. Example Workflow

### Task: Add Email Notification on Onboarding Complete

#### PLAN State

```markdown
## Plan: Onboarding Email

**Analyzed**:
- `services/onboarding.ext:120-150` - Current completion logic
- `services/notification.ext` - Existing notification service
- `systemPatterns.md#Event-Driven` - Event pattern
- `projectRules.md#Email Templates` - Email standards

**Reuse**:
- Extend `onboarding.ext:145` - emit "onboarding_completed" event
- Extend `notification.ext:67` - add event listener
- Add `templates/emails/onboarding_complete.template` - follow `welcome.template` pattern

Cannot create new notification service - existing service handles all notifications.

**Steps**:
1. `onboarding.ext:145` - emit event on completion
2. `notification.ext:67` - add listener for event
3. Create template following `welcome.template`
4. Add tests mirroring `tests/notification_test.ext`

**Integration**: Onboarding emits → Notification listens → Email service delivers (existing)
**Risks**: Email delivery fail → existing retry logic handles
**Tests**: Unit (event emission, listener) | Integration (e2e onboarding → email) | Manual (complete flow, verify email)

Ready for approval.
```

**User**: "approved"

---

#### BUILD State

```
Entering BUILD (substate: CODING)

Changes:
1. Modified `services/onboarding.ext:145` - added event emission
2. Extended `services/notification.ext:67` - added listener
3. Created `templates/emails/onboarding_complete.template`
4. Added `tests/notification_onboarding_test.ext`

Diff shows:
- services/onboarding.ext (+5, -1)
- services/notification.ext (+23, -0)
- templates/emails/onboarding_complete.template (+45, -0)
- tests/notification_onboarding_test.ext (+120, -0)

Ready for DIFF.
```

---

#### DIFF State

```markdown
## Proposed Changes

**Files**:
```
services/onboarding.ext                        |   5 +-
services/notification.ext                       |  23 +++
templates/emails/onboarding_complete.template  |  45 ++++
tests/notification_onboarding_test.ext         | 120 +++++++++++
4 files, 193 insertions(+), 1 deletion(-)
```

**Key Changes**:

`services/onboarding.ext`:
```diff
- // User completed onboarding
+ // User completed onboarding
+ emit_event('onboarding_completed', user_id, completion_data)
```

`services/notification.ext`:
```diff
+ function handle_onboarding_completed(user_id, data) {
+   template = load_template('onboarding_complete')
+   user = fetch_user(user_id)
+   send_email(user.email, template, data)
+ }
+ register_event_listener('onboarding_completed', handle_onboarding_completed)
```

**Rationale**: Follows `systemPatterns.md#Event-Driven Notifications` | Template matches existing structure | Tests mirror `tests/notification_welcome_test.ext`

**Integration**: No breaking changes | Event system handles async | Existing retry logic for failures

Ready for QA.
```

---

#### QA State

```markdown
Entering QA (substate: RUNNING)

## QA Results

**Tests**: ✅ PASS | Total: 156 (+11) | Passed: 156 | Failed: 0 | Duration: 18.2s
**Linter**: ✅ PASS | Errors: 0 | Warnings: 0
**Coverage**: Overall: 88.1% (+0.8%) | New code: 100% | Below threshold: None
**Build**: ✅ SUCCESS | Duration: 9.7s

**Verdict**: ✅ Ready for APPROVAL
```

---

#### APPROVAL State

```markdown
## Ready for Approval

Code changes complete. Ready for review.

**Files modified**:
- `services/onboarding.ext` (+5, -1)
- `services/notification.ext` (+23, -0)
- `templates/emails/onboarding_complete.template` (+45, -0)
- `tests/notification_onboarding_test.ext` (+120, -0)

**Git diff**: 4 files, 193 insertions(+), 1 deletion(-)

**Test Results**:
✅ 156 tests passing (+11) | ✅ Linter clean | ✅ Coverage: 88.1% (+0.8%) | ✅ Build successful

**Review Gates**:
- ✅ Tests pass
- ✅ Security reviewed (no sensitive data in emails, template escaped)
- ✅ Linter clean
- ✅ Documentation plan: Create `tasks/2025-10/251025_onboarding-email.md` + update monthly README

**Please review. Reply with**:
- "approved" | "looks good" | "document it" → APPLY
- "change X" | "fix Y" → BUILD with changes
- "revert" → Discard changes
```

**User**: "looks good"

---

#### APPLY State

```markdown
Entering APPLY

## Changes Applied

✅ All changes applied to sandbox branch
✅ 4 files modified
✅ Quick verification passed

Ready for DOCS.
```

---

#### DOCS State

```markdown
Entering DOCS

## Documentation Created

✅ Created `memory-bank/tasks/2025-10/251025_onboarding-email.md`
✅ Updated `memory-bank/tasks/2025-10/README.md`
✅ No MB pattern updates needed (used existing pattern)

Task complete.
```

---

## 8. Troubleshooting

### Decision Tree: Agent Stuck

```
Stuck? → Cycles ≥3?
           ↓ YES
         Identical diffs?
           ↓ YES → Load more MB context OR agent swap
           ↓ NO
         Different diffs?
           ↓ YES
         Same QA failure?
           ↓ YES → Environment issue OR requirement ambiguity
           ↓ NO
         Analyze failure pattern → Adjust approach
```

### Common Issues

| Issue | Symptoms | Resolution |
|-------|----------|------------|
| **Loop** | Same diff multiple times, QA fails repeatedly, no progress after 3+ cycles | Check budgets → Load more MB → Clarify requirements → Check environment → Agent swap |
| **Context Exceeded** | Token limit approaching, slow/truncated responses, forgetting earlier info | Rotate context (drop Task, reload essentials) → Focused mode (MB summaries only) → Break into subtasks → Agent swap |
| **CI ≠ Local** | QA passes, CI fails | Compare environments → Verify dependency versions → Check timing/concurrency → Check state cleanup → Document waiver if CI issue |
| **Security Fail** | Security checklist incomplete, sensitive data exposed, auth/authz bypassed | Never bypass → Return to BUILD → Fix all issues → Re-test → Document pattern if new |

### Stall Detection Protocol

**Condition**: Two consecutive identical diffs

**Response**:
1. Detect: Compare current diff with previous
2. Log: Record in operational log
3. Halt: Stop all BUILD attempts
4. Report: Present diagnosis to user
5. Request: More context, alternative approach, or agent swap

### Recovery Procedures

**Full Reset** (complete breakdown):
1. Log current state
2. Discard uncommitted changes
3. Reset to last known good state
4. Start new session with fresh agent
5. Load MB in full (Standard Discovery)
6. Re-analyze with fresh perspective

**Partial Rollback** (recent regression):
1. Identify last working state
2. Rollback only problematic changes
3. Keep working changes
4. Re-test to verify stability
5. Continue from DIFF or BUILD

**Agent Swap** (capability mismatch):
1. Complete current state (clean boundary)
2. Document progress in operational log
3. Prepare focused context: task contract, relevant MB files, current work state
4. Spawn specialized agent with focused context
5. Let specialized agent complete subtask
6. Integrate results back into main workflow

---

## Quick Reference

### State Transitions

`PLAN [user approves] → BUILD → DIFF → QA [pass] → APPROVAL [user approves] → APPLY → DOCS`

Iterations on failure: `BUILD ← DIFF ← QA ← APPROVAL`
Major changes: Return to `PLAN`

### Critical Rules

1. 🚫 No new files without exhaustive reuse analysis
2. 🚫 No applying changes without user approval
3. 🚫 No documentation until code approved
4. 🚫 No fake/mock data in production
5. ✅ Always cite `file:line` for code, `file.md#Section` for MB
6. ✅ Always work in sandbox (never main)
7. ✅ Always validate reuse opportunities first

### When Stuck

1. Check cycle count (>3 = stall)
2. Check for identical diffs (stall indicator)
3. Load more MB context
4. Break into smaller subtasks
5. Request user intervention
6. Consider agent swap

### Files Never Created Without Approval

- `memory-bank/tasks/*/` (task docs)
- `memory-bank/tasks/*/README.md` (monthly summaries)
- Any commits to version control

---

**Each session starts fresh. Memory Bank is your only persistent memory. Maintain it with precision.**

**Mission**: Build software respecting existing architecture, following established patterns, improving incrementally. Reuse over creation. Quality over speed. Approval over assumption.

**Let's build smarter — together.**
