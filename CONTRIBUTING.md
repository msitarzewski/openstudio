# Contributing to OpenStudio

Thank you for your interest in contributing to OpenStudio! This document provides guidelines and information to help you contribute effectively.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Architecture](#project-architecture)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Documentation Standards](#documentation-standards)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Communication](#communication)

---

## Code of Conduct

### Our Pledge

OpenStudio is committed to providing a welcoming and harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive behaviors include:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable behaviors include:**
- Harassment, trolling, or inflammatory comments
- Public or private harassment
- Publishing others' private information
- Other conduct which could reasonably be considered inappropriate

### Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be reported by contacting the project team. All complaints will be reviewed and investigated promptly and fairly.

---

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- Node.js 18+ installed
- Docker and Docker Compose installed
- Git configured with your name and email
- A GitHub account
- Familiarity with JavaScript (ES modules), WebRTC, or Web Audio (depending on contribution area)

### Initial Setup

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/openstudio.git
cd openstudio

# 3. Add upstream remote
git remote add upstream https://github.com/msitarzewski/openstudio.git

# 4. Create development environment
cp .env.example .env
cd server && npm install && cd ..
cd web && npm install && cd ..

# 5. Start development infrastructure
./dev.sh

# 6. In another terminal, start web client
cd web && python3 -m http.server 8086

# 7. Verify everything works
curl http://localhost:6736/health  # Should return {"status":"ok"}
open http://localhost:8086          # Browser should load studio interface
```

### Familiarize Yourself with the Codebase

1. **Read the Memory Bank documentation**:
   - Start with `memory-bank/toc.md` for an overview
   - Read `memory-bank/projectbrief.md` for vision and goals
   - Review `memory-bank/systemPatterns.md` for architecture patterns
   - Check `memory-bank/activeContext.md` for current priorities

2. **Review existing code**:
   - Signaling server: `server/` directory
   - Web client: `web/js/` directory
   - Tests: `tests/` and `server/test-*.js`

3. **Run the automated tests**:
   ```bash
   ./run-pre-validation.sh
   # All 6 tests should pass
   ```

---

## Development Workflow

### Finding Work

1. **Check Current Priorities**: Read `memory-bank/activeContext.md`
2. **Browse Open Issues**: Look for issues labeled `good first issue` or `help wanted`
3. **Review the Roadmap**: See `README.md` for planned features
4. **Ask Questions**: Open a discussion if you're unsure where to start

### Branch Strategy

```bash
# Always work on a feature branch
git checkout -b feature/your-feature-name

# Keep your branch up to date
git fetch upstream
git rebase upstream/main

# When ready, push to your fork
git push origin feature/your-feature-name
```

### Development Modes

OpenStudio supports two development workflows:

**Docker Mode** (default, recommended for most contributors):
- All services run in Docker containers
- Production parity (same environment as deployment)
- Best for: Feature work, integration testing, deployment validation

**Local Mode** (for signaling server development):
- Signaling server runs locally with `--watch` (auto-restart on file changes)
- Icecast and coturn remain in Docker
- Faster iteration cycles
- Best for: Backend development, debugging, rapid prototyping

```bash
# Switch between modes
./dev-switch.sh  # Interactive mode switcher

# OR manually edit .env
# Set DEV_MODE=docker or DEV_MODE=local
```

### Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (dependencies, configs)

**Examples**:
```
feat(audio): implement per-participant gain controls

Add UI sliders (0-200% range) with smooth AudioParam ramping to prevent
audio clicks. Mute buttons toggle with visual state changes.

Closes #42

---

fix(signaling): prevent message spoofing

Validate "from" field matches registered peer ID to prevent
impersonation attacks. Reject messages with mismatched IDs.

Fixes #58

---

docs(readme): update installation instructions

Add troubleshooting section for common port conflicts and
Docker service issues.
```

### Testing Your Changes

**Before submitting a pull request**:

```bash
# 1. Run automated tests
./run-pre-validation.sh
# All 6 tests must pass

# 2. Test manually
# - Create a room, join from multiple browsers
# - Verify your feature works as expected
# - Check browser console for errors

# 3. Test on a clean system (if infrastructure changes)
# - Use a fresh VM or Docker container
# - Follow README setup from scratch
# - Verify <5 minute setup time

# 4. Check for regressions
# - Test existing functionality still works
# - Verify no new console errors or warnings
```

---

## Project Architecture

### Core Principles

1. **Reuse Over Creation**: Search for existing functionality before creating new files
2. **Event-Driven Design**: Use EventTarget for loose coupling between modules
3. **ES Modules**: All JavaScript uses ES modules (type: "module")
4. **Zero Commercial Dependencies**: MIT/BSD/GPL licenses only
5. **Browser Native**: Leverage platform APIs (Web Audio, WebRTC, MediaRecorder)

### Directory Structure

```
openstudio/
├── server/                 # Signaling server (Node.js)
│   ├── server.js          # Main entry point
│   ├── lib/               # Server modules
│   └── test-*.js          # Server tests
├── web/                    # Web studio client
│   ├── index.html         # Main HTML
│   ├── css/               # Stylesheets
│   └── js/                # Client-side JavaScript
├── tests/                  # Playwright end-to-end tests
├── docs/                   # User and developer documentation
├── memory-bank/            # Project knowledge base
│   ├── releases/          # Release planning and task tracking
│   └── *.md               # Core documentation files
├── icecast/                # Custom Icecast Dockerfile
├── docker-compose.yml      # Infrastructure orchestration
└── station-manifest.sample.json  # Configuration template
```

### Key Modules

**Signaling Server**:
- `websocket-server.js`: WebSocket wrapper with ping/pong
- `signaling-protocol.js`: Peer registry and message relay
- `room-manager.js`: Room lifecycle and auto-cleanup
- `message-validator.js`: Anti-spoofing validation

**Web Studio Client**:
- `signaling-client.js`: WebSocket client with auto-reconnection
- `rtc-manager.js`: RTCPeerConnection manager
- `connection-manager.js`: Perfect Negotiation and retry logic
- `audio-graph.js`: Per-participant routing with Web Audio API
- `mix-minus.js`: Phase-inversion algorithm for professional audio
- `program-bus.js`: Unified stereo mixing
- `main.js`: Application orchestration

---

## Coding Standards

### JavaScript Style

**ES Modules**:
```javascript
// ✅ Good
import { SomeClass } from './some-module.js';
export class MyClass extends EventTarget { }

// ❌ Bad
const SomeClass = require('./some-module');
module.exports = MyClass;
```

**Event-Driven Architecture**:
```javascript
// ✅ Good - Extend EventTarget for loose coupling
class SignalingClient extends EventTarget {
  connect() {
    this.dispatchEvent(new CustomEvent('connected', { detail: { peerId } }));
  }
}

// ❌ Bad - Direct callbacks create tight coupling
class SignalingClient {
  connect(onConnected) {
    onConnected(peerId);
  }
}
```

**Clear, Descriptive Names**:
```javascript
// ✅ Good
function createMixMinusBus(peerId, compressorNode) { }
const isPolite = this.peerId < remotePeerId;

// ❌ Bad
function createBus(p, c) { }
const pol = this.peerId < remotePeerId;
```

**Single Responsibility**:
```javascript
// ✅ Good - Each class has one job
class AudioContextManager { }  // Manages AudioContext lifecycle
class AudioGraph { }            // Routes participant audio
class MixMinusManager { }       // Calculates mix-minus buses

// ❌ Bad - God class doing everything
class AudioManager {
  manageContext() { }
  routeAudio() { }
  calculateMixMinus() { }
  playReturnFeeds() { }
}
```

**Error Handling**:
```javascript
// ✅ Good - Handle errors, log useful context
try {
  const answer = await this.rtcManager.handleOffer(remotePeerId, sdp);
  this.signalingClient.sendAnswer(remotePeerId, answer);
} catch (error) {
  console.error(`[ConnectionManager] Failed to handle offer from ${remotePeerId}:`, error);
  this.setConnectionState(remotePeerId, { status: 'failed' });
}

// ❌ Bad - Silent failures
try {
  await this.rtcManager.handleOffer(remotePeerId, sdp);
} catch (error) {
  // Ignore
}
```

### Documentation

**JSDoc for Public APIs**:
```javascript
/**
 * Add return feed track to peer connection
 * This triggers the 'negotiationneeded' event which handles renegotiation automatically
 *
 * @param {string} remotePeerId - Remote peer identifier
 * @param {MediaStream} mixMinusStream - Mix-minus audio stream (all participants except remotePeerId)
 * @throws {Error} If peer connection not found or stream is null
 */
addReturnFeedTrack(remotePeerId, mixMinusStream) {
  // Implementation
}
```

**Clear Comments for Complex Logic**:
```javascript
// Perfect Negotiation: Detect glare collision
// Collision occurs if we're making an offer OR peer connection isn't stable
const offerCollision = state.makingOffer ||
  this.rtcManager.peerConnections.get(remotePeerId)?.signalingState !== 'stable';

if (offerCollision) {
  if (!isPolite) {
    // Impolite peer ignores incoming offer (other peer will roll back)
    return;
  } else {
    // Polite peer rolls back and accepts incoming offer
    console.log('[ConnectionManager] We are polite, rolling back our offer');
  }
}
```

### File Organization

**One Class Per File**:
```javascript
// ✅ Good
// audio-graph.js
export class AudioGraph { }

// mix-minus.js
export class MixMinusManager { }

// ❌ Bad
// audio.js
export class AudioGraph { }
export class MixMinusManager { }
export class ProgramBus { }
```

**Logical Grouping**:
```
web/js/
├── signaling-client.js      # WebSocket communication
├── rtc-manager.js            # WebRTC peer connections
├── connection-manager.js     # Connection orchestration
├── audio-context-manager.js  # AudioContext lifecycle
├── audio-graph.js            # Participant routing
├── mix-minus.js              # Mix-minus calculation
├── program-bus.js            # Program bus mixing
└── main.js                   # Application entry point
```

---

## Testing Requirements

### Test Coverage

All new features must include:

1. **Unit Tests** (if applicable): Test individual functions/classes
2. **Integration Tests**: Test interaction between modules
3. **End-to-End Tests**: Test complete user workflows

### Writing Tests

**Playwright Tests** (for client-side features):

```javascript
// Example: tests/test-your-feature.mjs
import { chromium } from 'playwright';

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    console.log(`[Browser] ${msg.text()}`);
  });

  // Test your feature
  await page.goto('http://localhost:8086/');
  // ... test steps ...

  await browser.close();
}

runTest().catch(console.error);
```

**Server Tests** (for signaling server):

```javascript
// Example: server/test-your-feature.js
import WebSocket from 'ws';

async function testYourFeature() {
  const ws = new WebSocket('ws://localhost:6736');

  return new Promise((resolve, reject) => {
    ws.on('message', (data) => {
      const message = JSON.parse(data);
      // Assert expected behavior
      console.log('✅ Test passed');
      ws.close();
      resolve();
    });

    ws.on('open', () => {
      // Send test message
      ws.send(JSON.stringify({ type: 'test' }));
    });
  });
}
```

### Running Tests

```bash
# Run all automated tests
./run-pre-validation.sh

# Run individual test
node tests/test-your-feature.mjs

# Run server tests
node server/test-your-feature.js
```

---

## Documentation Standards

### When to Update Documentation

- **Always**: Update documentation when changing behavior
- **New Features**: Add usage examples and API documentation
- **Breaking Changes**: Document migration path in CHANGELOG
- **Bug Fixes**: Update troubleshooting guide if applicable

### Documentation Files

| File | When to Update |
|------|----------------|
| `README.md` | Major features, setup process changes |
| `CHANGELOG.md` | Every pull request (add to `[Unreleased]` section) |
| `docs/TROUBLESHOOTING.md` | New common issues discovered |
| `docs/ARCHITECTURE-IMPLEMENTATION.md` | Architectural changes |
| `memory-bank/systemPatterns.md` | New architectural patterns |
| `memory-bank/activeContext.md` | Change in priorities or focus |

### Documentation Format

**Clear, Concise Headers**:
```markdown
## Feature Name

Brief description of what it does and why it matters.

### Usage

Code example showing typical usage.

### Configuration

Available options and their defaults.

### Troubleshooting

Common issues and solutions.
```

---

## Pull Request Process

### Before Submitting

- [ ] All automated tests pass (`./run-pre-validation.sh`)
- [ ] Code follows project coding standards
- [ ] New features have tests
- [ ] Documentation updated
- [ ] Commit messages follow Conventional Commits format
- [ ] Branch rebased on latest `main`

### Submitting

1. **Push to Your Fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create Pull Request on GitHub**:
   - Use a clear, descriptive title
   - Reference related issues (`Closes #42`, `Fixes #58`)
   - Describe what changed and why
   - Include screenshots/videos for UI changes
   - List any breaking changes

3. **PR Template**:
   ```markdown
   ## Description
   Brief summary of changes

   ## Related Issues
   Closes #42

   ## Type of Change
   - [ ] Bug fix (non-breaking change which fixes an issue)
   - [ ] New feature (non-breaking change which adds functionality)
   - [ ] Breaking change (fix or feature that would cause existing functionality to change)
   - [ ] Documentation update

   ## Testing
   - [ ] All automated tests pass
   - [ ] Tested manually with [describe scenarios]
   - [ ] No regressions found

   ## Screenshots (if applicable)
   [Add screenshots here]

   ## Checklist
   - [ ] Code follows project style guidelines
   - [ ] Self-reviewed code
   - [ ] Commented complex logic
   - [ ] Updated documentation
   - [ ] Added tests
   - [ ] CHANGELOG.md updated
   ```

### Review Process

1. **Automated Checks**: CI runs tests and linting
2. **Code Review**: Maintainer reviews code quality and architecture
3. **Discussion**: Address feedback and requested changes
4. **Approval**: Once approved, maintainer merges

### After Merge

- Your contribution will be included in the next release
- You'll be credited in `CHANGELOG.md` and release notes
- Thank you for contributing! 🎉

---

## Issue Reporting

### Before Creating an Issue

1. **Search Existing Issues**: Check if already reported
2. **Try Latest Version**: Ensure you're on current `main` branch
3. **Read Documentation**: Check troubleshooting guide
4. **Reproduce**: Verify issue is reproducible

### Bug Reports

Use this template:

```markdown
## Bug Description
Clear, concise description of the bug

## Steps to Reproduce
1. Start OpenStudio with...
2. Click on...
3. Observe error...

## Expected Behavior
What you expected to happen

## Actual Behavior
What actually happened

## Environment
- OS: [macOS 14.1 / Windows 11 / Ubuntu 22.04]
- Node.js Version: [18.x.x]
- Docker Version: [24.x.x]
- Browser: [Chrome 120 / Firefox 121 / Safari 17]
- OpenStudio Version: [commit SHA or v0.1.0]

## Logs
```
Paste relevant logs here (browser console, server logs, Docker logs)
```

## Screenshots (if applicable)
[Add screenshots]

## Additional Context
Any other relevant information
```

### Feature Requests

Use this template:

```markdown
## Feature Description
Clear, concise description of proposed feature

## Use Case
Explain the problem this feature would solve

## Proposed Solution
How you envision this working

## Alternatives Considered
Other approaches you've thought about

## Additional Context
Any other relevant information, mockups, or examples
```

---

## Communication

### Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and community support
- **Discord/Matrix**: Real-time chat (links coming soon)

### Response Times

- **Maintainers**: Aim to respond within 3-5 business days
- **Community**: Often responds faster!
- **Critical Bugs**: Prioritized and addressed ASAP

### Getting Help

1. **Check Documentation First**: Most answers are in the docs
2. **Search Issues**: Someone may have asked before
3. **Ask in Discussions**: Community is friendly and helpful
4. **Be Patient**: Maintainers are volunteers

---

## Recognition

Contributors are recognized in:

- `CHANGELOG.md` for each release
- GitHub release notes
- Project README (for significant contributions)

Top contributors may be invited to become maintainers.

---

## License

By contributing to OpenStudio, you agree that your contributions will be licensed under the MIT License.

---

## Questions?

If anything in this guide is unclear, please:

1. Open a GitHub Discussion
2. Ask in Discord/Matrix (when available)
3. Open an issue labeled `documentation`

**We're here to help you contribute successfully!**

---

## Thank You!

Every contribution, no matter how small, helps build a better alternative to commercial broadcast platforms.

**Together, we're taking back the airwaves.** 🎙️
