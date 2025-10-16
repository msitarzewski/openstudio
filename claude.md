# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- claude:agent-directives -->

---

## Critical: Memory Bank Architecture

**IMPORTANT**: This project uses a Memory Bank system. You MUST read ALL memory bank files at the start of EVERY task. The memory bank is located in `/memory-bank/` and contains:

1. **Start with**: `toc.md` ? Index of all memory bank files and tasks
2. **Then read in order**:
   - `projectbrief.md` ? Core vision and requirements
   - `productContext.md` ? Why this exists and user goals
   - `systemPatterns.md` ? Architecture and design patterns
   - `techContext.md` ? Tech stack and constraints
   - `activeContext.md` ? Current focus and decisions
   - `progress.md` ? What's working and what's next
   - `projectRules.md` ? Project-specific patterns and preferences

---

## Development Session Startup Checklist

### Standard Discovery Process (Full Context Loading)
```markdown
- [ ] ? Load all core Memory Bank files
- [ ] ? Verify `toc.md` is up-to-date
- [ ] ? Confirm `activeContext.md` reflects most recent work
- [ ] ? Log session start in task documentation
- [ ] ? Use specialized agents following PM ? Dev ? QA ? PM workflow
```

### Current Month Focus (NEW - DEFAULT)
```markdown
- [ ] ? Load current month README only (tasks/YYYY-MM/README.md)
- [ ] ? Check recent achievements and next priorities from current month
- [ ] ? Load quick-start.md for common patterns if needed
- [ ] ? Skip historical context unless specifically investigating legacy issues
```

### Fast Track Development (Skip Discovery)
```markdown
- [ ] ? Load `quick-start.md` for common patterns and session data
- [ ] ? Load `database-schema.md` if applicable for query patterns
- [ ] ? Load `build-deployment.md` for standard build sequences
- [ ] ? Load `testing-patterns.md` for verification commands
```

### Historical Deep Dive (On-Demand Only)
```markdown
- [ ] Load specific month README when investigating legacy issues
- [ ] Cross-reference with current work patterns
- [ ] Use for architectural decision context and "why" questions
```

---

## Compliance Confirmation with User Responsibility Reminder

When acknowledging compliance at session start, use this enhanced format to remind the user of their leadership role:

```
COMPLIANCE CONFIRMED: I will prioritize reuse over creation

??  USER RESPONSIBILITY REMINDER (GIGO Prevention):
?? Provide clear task objectives in your request
?? Reference relevant historical context when needed
?? Define expected outcomes and success criteria
??  Specify any architectural constraints or patterns to follow
???  You are the leader of the gang - clear input drives excellent output!

[Continue with memory bank loading...]
```

This visible reminder ensures optimal task context and prevents "garbage in, garbage out" scenarios.

---

## Working with Specialized Agents

This project uses a multi-agent system rooted in the Memory Bank model with dynamic agent selection.

### Available Agent Categories

**Engineering Agents:**
- `engineering-frontend-developer` ? Frontend specialist for HTML/CSS/JS implementation
- `engineering-backend-architect` ? Backend systems and API architecture
- `engineering-senior-developer` ? Premium implementation specialist
- `engineering-ai-engineer` ? AI/ML integration and intelligent features
- `engineering-rapid-prototyper` ? Fast proof-of-concept development
- `engineering-devops-automator` ? Infrastructure and deployment automation
- `engineering-mobile-app-builder` ? Mobile application development

**Design Agents:**
- `design-ui-designer` ? Visual design and component creation
- `design-ux-researcher` ? User research and usability testing
- `design-ux-architect` ? Technical architecture and UX guidance
- `design-visual-storyteller` ? Visual narratives and brand storytelling
- `design-brand-guardian` ? Brand consistency and positioning
- `design-whimsy-injector` ? Personality and delightful interactions

**Testing Agents:**
- `testing-reality-checker` ? Evidence-based quality certification
- `testing-evidence-collector` ? Screenshot-obsessed QA specialist
- `testing-api-tester` ? API validation and testing
- `testing-performance-benchmarker` ? Performance optimization
- `testing-test-results-analyzer` ? Test analysis and insights
- `testing-workflow-optimizer` ? Process improvement
- `testing-tool-evaluator` ? Technology assessment

**Project Management Agents:**
- `project-manager-senior` ? Task breakdown and project coordination
- `project-management-project-shepherd` ? Cross-functional coordination
- `project-management-studio-producer` ? High-level strategic orchestration
- `project-management-studio-operations` ? Day-to-day operations
- `project-management-experiment-tracker` ? A/B testing and experimentation

**Product Agents:**
- `product-sprint-prioritizer` ? Sprint planning and prioritization
- `product-trend-researcher` ? Market intelligence and trends
- `product-feedback-synthesizer` ? User feedback analysis

**Marketing Agents:**
- `marketing-growth-hacker` ? Rapid user acquisition strategies
- `marketing-content-creator` ? Multi-platform content creation
- `marketing-social-media-strategist` ? Social media campaigns
- `marketing-twitter-engager` ? Twitter/LinkedIn engagement
- `marketing-tiktok-strategist` ? TikTok viral content
- `marketing-instagram-curator` ? Instagram visual storytelling
- `marketing-reddit-community-builder` ? Reddit community engagement
- `marketing-app-store-optimizer` ? App store optimization

**Support Agents:**
- `support-support-responder` ? Customer support excellence
- `support-analytics-reporter` ? Data analysis and reporting
- `support-finance-tracker` ? Financial planning and analysis
- `support-infrastructure-maintainer` ? System reliability and maintenance
- `support-legal-compliance-checker` ? Legal and compliance review

**Specialized Agents:**
- `agents-orchestrator` ? Autonomous pipeline management
- `lsp-index-engineer` ? Code intelligence systems
- `data-analytics-reporter` ? Business intelligence and dashboards

**Spatial Computing Agents:**
- `xr-interface-architect` ? AR/VR/XR interface design
- `xr-immersive-developer` ? WebXR and immersive experiences
- `xr-cockpit-interaction-specialist` ? Cockpit control systems
- `macos-spatial-metal-engineer` ? macOS/Vision Pro native development

### Development Workflow: PM ? Dev ? QA ? PM

**Planning Phase**:
- Load all Memory Bank context
- Analyze requirements against existing architecture
- Create implementation strategy
- Delegate to appropriate development specialists

**Development & QA Iteration**:
- **Development Specialist**: Implements code following project patterns and Memory Bank rules
- **Quality Specialist**: Reviews compliance with:
  - `systemPatterns.md`
  - `projectRules.md`
  - `techContext.md`
- **Iterative Collaboration**: Dev and QA work together until requirements are met
- **Documentation**: All findings logged in task documentation

**Completion Phase**:
- Quality specialist confirms compliance and functionality
- Planning coordination wraps up with final deliverables
- Patterns and learnings added to `projectRules.md` using `## Pattern: [name]` format

---

## Task Documentation Format

Use existing task files in `/memory-bank/tasks/` or create new ones following the established pattern:

```markdown
## YYMMDD_task-name

**Phase**: Planning
**Action**: Strategy approved
**Notes**: Development specialist may proceed with standard components as described.

---

**Phase**: Development
**Action**: Implementation submitted
**Files Modified**: `path/to/file1.html`, `path/to/file2.js`

---

**Phase**: Quality Review
**Action**: Revision required
**Reason**: Incomplete adherence to `systemPatterns.md > Component Structure` rules.
**Next Step**: Fix implementation issues, re-test.

---

**Phase**: Quality Review
**Action**: Approved
**Result**: Implementation meets all project standards and requirements.
```

---

## Plan / Act Workflow

**Plan Mode**
1. Load memory bank context
2. Planning specialist validates context
3. Strategy is created and logged
4. Development specialist receives assignment

**Act Mode**
1. Development specialist implements feature
2. Quality specialist audits and provides feedback
3. Iterative dev/QA collaboration until approved
4. Updates made to:
   - Memory Bank
   - `projectRules.md`
   - Task documentation

---

## Documentation Rules

Update the Memory Bank when:
- Discovering new patterns
- Making architectural decisions
- Completing major features
- User explicitly requests with `"update memory bank"`

---

## Final Reminder

Each development session begins *fresh*. Memory resets between sessions. The `/memory-bank/` is the ONLY persistent context. Maintain it with precision.

Use specialized agents wisely. Let the system choose the right expertise for each phase. Focus on quality through collaborative iteration.

Let's build smarter?together.
