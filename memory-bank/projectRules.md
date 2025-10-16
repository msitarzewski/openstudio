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
