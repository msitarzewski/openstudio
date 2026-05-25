# Project Rules: OpenStudio

## Code Style & Conventions

### JavaScript Style

- **ES Modules**: Use `import/export`, not `require()` (Node.js with "type": "module")
- **Indentation**: 2 spaces (no tabs)
- **Semicolons**: Required
- **Quotes**: Single quotes for strings (`'hello'`), double quotes for HTML attributes
- **Naming**:
  - camelCase for variables and functions (`audioContext`, `createRoom`)
  - PascalCase for classes (`AudioMixer`, `PeerConnection`)
  - SCREAMING_SNAKE_CASE for constants (`MAX_PARTICIPANTS`, `DEFAULT_BITRATE`)

### File Naming

- Lowercase with hyphens: `signal-server.js`, `audio-mixer.js`
- Test files: `*.test.js` or `*.spec.js`
- Config files: `.eslintrc.json`, `docker-compose.yml`

### Code Organization

- One class per file (where applicable)
- Group related functions in modules
- Keep files under 300 lines (refactor if larger)
- Exports at bottom of file

### Comments

- JSDoc for public APIs
- Inline comments for complex logic only
- No commented-out code (use git history)
- TODO comments must reference issue number: `// TODO(#123): implement retry logic`

## Git Workflow

### Commit Messages

**Format**: `<type>: <subject>` (lowercase subject)

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `refactor`: Code restructuring (no behavior change)
- `test`: Test additions or fixes
- `chore`: Build process, dependencies, tooling

**Examples**:
- `feat: add mix-minus bus calculation`
- `fix: prevent self-echo in caller return feeds`
- `docs: update quick start with HTTPS requirements`
- `refactor: extract room state to separate module`

### Branch Strategy (Future)

- `main`: Stable releases only
- `develop`: Integration branch
- `feature/*`: New features
- `fix/*`: Bug fixes

**Note**: For MVP, direct commits to `main` are acceptable (single developer phase)

## Dependency Management

### Adding Dependencies

**Process**:
1. Check if feature can be implemented without new dependency
2. Search for minimal, well-maintained alternatives
3. Verify license compatibility (MIT/BSD/Apache/GPL only)
4. Check npm audit and GitHub activity
5. Document rationale in commit message

**Prohibited**:
- Proprietary SDKs
- Unmaintained packages (>1 year since last update)
- Packages with critical vulnerabilities
- Large frameworks for small features

### Updating Dependencies

- Review changelogs before updating
- Test thoroughly after major version bumps
- Pin exact versions in `package.json` (no `^` or `~` in production)

## Testing Practices

### Unit Tests

- Test pure functions and logic
- Mock external dependencies (network, timers)
- Aim for >80% coverage on critical paths
- Fast execution (<1s per test suite)

### Integration Tests

- Test component interactions
- Use real signaling server (test instance)
- Mock external services (Icecast, TURN)
- Allow up to 10s per test

### E2E Tests

- Full user workflows
- Real browser instances (Puppeteer/Playwright)
- Fewer tests, high value scenarios
- Run in CI, may be slow

### Manual Testing

- Critical for WebRTC (browser quirks)
- Test matrix: Chrome, Firefox, Safari
- Document test scenarios in `/tests/manual/`

## Error Handling

### Principles

- **Fail Fast**: Don't suppress errors, log and propagate
- **User-Friendly Messages**: Technical details in logs, clear guidance in UI
- **Graceful Degradation**: Continue with reduced functionality if possible
- **Retry with Backoff**: Network operations should retry (exponential backoff)

### Patterns

**Good**:
```javascript
try {
  await connectToPeer(peerId);
} catch (error) {
  console.error('Failed to connect to peer:', peerId, error);
  ui.showError('Connection failed. Check network and try again.');
  throw error; // propagate unless handled
}
```

**Bad**:
```javascript
try {
  await connectToPeer(peerId);
} catch (error) {
  // Silent failure - BAD!
}
```

## Security Practices

### Input Validation

- Validate all user input (room IDs, usernames, etc.)
- Sanitize before displaying in UI (prevent XSS)
- Reject invalid SDP/ICE candidates early

### Authentication

- Use JWT tokens for room access
- Time-box tokens (default: 4 hours)
- Rotate signing keys periodically

### Cryptography

- Use `@noble/ed25519` for keypairs (audited, no native deps)
- Never roll custom crypto
- Use `crypto.getRandomValues()` for random data (not `Math.random()`)

### Data Handling

- No PII storage without explicit user consent
- No third-party analytics by default
- Clear data retention policies

## Performance Guidelines

### Web Audio

- Reuse audio nodes when possible (don't create/destroy repeatedly)
- Disconnect unused nodes (prevent memory leaks)
- Monitor CPU usage (aim for <30% on typical hardware)

### WebRTC

- Set appropriate Opus bitrate (48kbps for voice, 128kbps for program output)
- Enable DTX (Discontinuous Transmission) for bandwidth savings
- Monitor RTCStats for connection quality

### Signaling

- Keep messages small (<1KB typical)
- Use binary formats (MessagePack) if JSON overhead becomes issue
- Rate limit per-client (prevent DoS)

## Documentation Standards

### Code Documentation

- JSDoc for all public APIs
- README.md in each major directory
- Inline comments for non-obvious logic

### User Documentation

- Quick start guide (< 5 min to first broadcast)
- Troubleshooting guide (common issues + solutions)
- Architecture docs (for contributors)

### Task Documentation

- Use Memory Bank task format
- Document decisions, not just outcomes
- Link to relevant code changes

## Task Tracking & Progress

### Release Task Files

Release tasks are stored in `memory-bank/releases/VERSION/tasks/` as individual YAML files.

**Naming Convention**:
- Format: `NNN_descriptive_name.yml`
- Example: `001_project_structure.yml`, `008_first_webrtc_connection.yml`

**Completion Marker (X-Marker System)**:
- When a task is **complete and documented**, rename the file to include `_X_` after the task number
- Format: `NNN_X_descriptive_name.yml`
- Example: `001_project_structure.yml` → `001_X_project_structure.yml`

**Visual Progress Tracking**:
```
001_X_project_structure.yml          ✅ Complete
002_X_docker_verification.yml        ✅ Complete
003_signaling_server_skeleton.yml    ⏳ In progress
004_station_manifest_integration.yml ⏸️  Pending
...
020_documentation_deployment.yml     ⏸️  Pending
```

**Benefits**:
- Instant visual feedback via `ls` command
- No database or tracking tools needed
- File system is source of truth
- Easy to count: `ls *_X_*.yml | wc -l`

**Workflow**:
1. Start task: Read `NNN_task.yml` file
2. Implement according to specification
3. User approves implementation
4. Create task documentation in `memory-bank/tasks/YYYY-MM/`
5. Update monthly README
6. Rename task file: `NNN_task.yml` → `NNN_X_task.yml`

## Project-Specific Patterns

### Pattern: WebRTC Connection Setup

**Location**: `web/js/rtc-manager.js` (planned)

**Usage**:
```javascript
const peerConnection = createPeerConnection(peerId, {
  onTrack: (track) => audioGraph.addSource(peerId, track),
  onIceCandidate: (candidate) => signaling.send({ type: 'ice', candidate })
});
```

**Rationale**: Centralized connection setup with consistent error handling

---

### Pattern: Room State Management

**Location**: `server/room-manager.js` (planned)

**Usage**:
```javascript
const room = roomManager.createRoom(hostId);
room.addParticipant(callerId, { role: 'caller' });
room.broadcast({ type: 'participant_joined', id: callerId });
```

**Rationale**: Single source of truth for room membership and state

---

### Pattern: Mix-Minus Calculation

**Location**: `web/js/audio-mixer.js` (planned)

**Usage**:
```javascript
const mixMinusBus = audioMixer.createMixMinusBus(excludeParticipantId);
audioMixer.routeToReturnFeed(participantId, mixMinusBus);
```

**Rationale**: Encapsulates complex Web Audio graph manipulation

---

### Pattern: Binary-Aware Multipart Parser

**Location**: `server/server.js:82-173` (`handleExportClean`), `server/server.js:519+` (`handleExportZip`)

**Rule**: When parsing `multipart/form-data` parts that lack a per-part `Content-Length` header, **find the next regular boundary AND the end-of-message boundary, take the minimum, and trim the trailing CRLF** before the boundary marker.

**Why**: Browser FormData and many HTTP clients don't emit per-part `Content-Length`. The original parser only searched for the next regular boundary (`--<boundary>`) and fell back to `body.length`. The end-of-message marker (`--<boundary>--`) is a *different* byte sequence, so the last part silently included the trailing boundary in its content. For text fields like `outputFormat=mp3`, the resulting `formatParam` was `"mp3\r\n--<boundary>--"` and never matched expected values — MP3 export silently degraded to WAV. Surfaced in the v0.3.1 audit.

**Implementation**:
```javascript
} else {
  const nextBoundary = body.indexOf(boundaryPrefix, contentStart);
  const endBoundary = body.indexOf(boundaryEnd, contentStart);
  const candidates = [nextBoundary, endBoundary].filter(i => i !== -1);
  contentEnd = candidates.length > 0 ? Math.min(...candidates) : body.length;
  if (contentEnd >= 2 && body[contentEnd - 2] === 0x0d && body[contentEnd - 1] === 0x0a) {
    contentEnd -= 2;
  }
}
```

**Applies to**: every multipart endpoint where one or more parts may not carry per-part Content-Length, which is most of them in practice.

---

### Pattern: Env-Driven Optional Integration Endpoints

**Location**: `server/lib/show-notes-generator.js:15-16`

**Rule**: When an integration calls out to an external service whose **location is operator-specific** (LLM, transcription backend, third-party API), expose the base URL and any operator-tunable parameters (model name, API key, etc.) via env vars at the top of the module. Default to the most common OSS setup so it "just works" out of the box.

**Why**: Hardcoding an integration URL (especially a private or NAT-routed IP) makes the feature broken-by-default for anyone else. Surfaced in the v0.3.1 audit — show-notes had a private dev-machine IP baked into the fetch URL, unreachable from any other host.

**Implementation**:
```javascript
const LLM_BASE_URL = (process.env.LLM_BASE_URL || 'http://localhost:1234/v1').replace(/\/$/, '');
const LLM_MODEL = process.env.LLM_MODEL || 'qwen3.5-35b';

// then in call sites:
const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
  body: JSON.stringify({ model: LLM_MODEL, ... }),
});
```

**Companion rule**: Document every new env var in `.env.example` with a short comment explaining what it does and what the default does. Don't introduce env vars that can't be discovered from the env example file.

---

### Pattern: Frontend Fallback on Optional Server Endpoints

**Location**: `web/js/recording-manager.js:240` (`bundleAndDownload`)

**Rule**: When introducing a new server endpoint that enhances an existing client-side feature (single zip vs. N downloads, server-cleaned audio vs. raw blob), wrap the new flow in `try/catch` and call the existing fallback path on any failure — network error, non-2xx response, or server unreachable. The user never loses access to their data because of an optional enhancement.

**Why**: New endpoints can have transient bugs, infrastructure can be misconfigured, the operator may not have rebuilt their image. The fallback keeps the feature usable while the operator diagnoses.

**Implementation**:
```javascript
async bundleAndDownload(recordings, peerNames) {
  try {
    const response = await fetch('/api/export/zip', { method: 'POST', body: formData });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const zipBlob = await response.blob();
    this.downloadTrack(zipBlob, `openstudio-bundle-${timestamp}.zip`);
  } catch (err) {
    console.warn('bundleAndDownload failed, falling back to per-track downloads:', err);
    this.downloadAll(recordings, peerNames);
  }
}
```

---

## Anti-Patterns (Avoid These)

### ❌ Defensive Programming

**Why**: Works around broken code instead of fixing root cause

**Instead**: Fix the bug, add tests, validate inputs explicitly

### ❌ Magic Numbers

**Why**: Unclear intent, hard to maintain

**Instead**: Use named constants with clear units

**Bad**: `setTimeout(callback, 5000)`
**Good**: `setTimeout(callback, RECONNECT_DELAY_MS)`

### ❌ God Objects

**Why**: Single class/module does too much, hard to test and modify

**Instead**: Split responsibilities, follow single-responsibility principle

### ❌ Premature Optimization

**Why**: Complicates code without proven benefit

**Instead**: Measure first, optimize bottlenecks only

### ❌ Callback Hell

**Why**: Hard to read, error handling is difficult

**Instead**: Use async/await consistently

## Onboarding Checklist

New contributors (including future sessions with Claude) should:

- [ ] Read all Memory Bank core files
- [ ] Review ARCHITECTURE.md and SIGNAL_FLOW.md
- [ ] Understand zero-dependency philosophy
- [ ] Set up development environment (Docker, Node.js)
- [ ] Run through quick start guide
- [ ] Review open issues and PRs (when applicable)
- [ ] Check activeContext.md for current priorities

## Maintenance Duties

### Regular Tasks

- **Weekly**: Review open issues, merge ready PRs
- **Monthly**: Update dependencies (minor versions), review Memory Bank accuracy
- **Per Release**: Update CHANGELOG.md, tag release, update docs

### Memory Bank Updates

Trigger updates when:
- New architectural patterns emerge
- Major features completed
- Technical decisions made
- User explicitly requests: "update memory bank"

Keep Memory Bank lean - move stale content to task documentation archives.
