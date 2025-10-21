# Task: Dual-Mode Development with .env Configuration

**Date**: 2025-10-21
**Type**: Infrastructure Enhancement
**Status**: Complete

## Problem Statement

Users following installation instructions encountered port conflict when running `npm run dev`:

```
Error: listen EADDRINUSE: address already in use :::6736
```

**Root Cause Analysis**:
- `docker compose up -d` starts signaling container → binds port 6736
- User runs `cd server && npm run dev` → tries to bind port 6736
- Port already in use → server crashes with EADDRINUSE
- README instructions didn't account for port conflict between Docker and local development

**User Experience Impact**:
- Frustrating first-run experience (error immediately after following docs)
- Unclear resolution (stop Docker? Don't use npm run dev?)
- No guidance on development workflow choice
- Friction between production parity (Docker) and rapid iteration (local dev)

## Solution

Implement flexible development workflow with `.env`-based mode switching:

**Dual Development Modes**:
1. **Docker Mode** (default): All services in containers (production parity, recommended for most users)
2. **Local Mode**: Signaling locally with hot reload, Icecast/coturn in Docker (core development)

**Universal Development Script**: `./dev.sh` reads `.env` and starts appropriate mode

**Mode Switcher**: `./dev-switch.sh` provides interactive mode switching

## Implementation

### 1. Created .env.example (Configuration Template)

```bash
# OpenStudio Development Configuration

# Development Mode
# - docker: Run all services in Docker (recommended for most users)
# - local: Run signaling server locally with hot reload (for core development)
DEV_MODE=docker

# Local Development Port (only used when DEV_MODE=local)
# Note: Docker mode always uses port 6736
LOCAL_SIGNALING_PORT=6736
```

**Design Decisions**:
- Default: `DEV_MODE=docker` (production parity for most users)
- Single configuration file (simple, standard practice)
- Inline documentation (self-explanatory)
- Committed to repo (users copy to `.env`)

### 2. Created dev.sh (Universal Development Script)

**Features**:
- Auto-detects `.env`, creates from example if missing
- Exports environment variables to shell session
- Reads `DEV_MODE` with fallback to `docker`
- Two execution paths:

**Docker Mode**:
```bash
./dev.sh
# 📦 Starts all services in Docker
# ✅ Shows service status
# 📋 Displays helpful commands (logs, rebuild)
# 🔄 Offers to follow signaling logs (interactive)
```

**Local Mode**:
```bash
./dev.sh
# 📦 Stops Docker signaling container
# ✅ Shows remaining Docker services (Icecast, coturn)
# 🔧 Starts local signaling server with --watch (hot reload)
# Press Ctrl+C to stop
```

**Error Handling**:
- Invalid `DEV_MODE` → Clear error message, exit 1
- Missing `.env` → Auto-creates from `.env.example`, continues
- Graceful script execution with `set -e`

### 3. Created dev-switch.sh (Interactive Mode Switcher)

**Workflow**:
```bash
./dev-switch.sh
# Current mode: docker
#
# Switch to:
#   1) docker  - All services in Docker (recommended)
#   2) local   - Signaling locally, Icecast/coturn in Docker
#
# Choose mode (1/2): 2
# ✅ Switched to local mode
#    Run: ./dev.sh
```

**Implementation**:
- Reads current mode from `.env`
- Interactive menu (1 or 2)
- Uses `sed -i.bak` for cross-platform compatibility (macOS/Linux)
- Cleans up `.env.bak` backup file
- Clear success message with next step

### 4. Updated .gitignore

**Changes**:
```diff
 # Environment variables (user-specific)
 .env
 .env.local
 .env.*.local
+
+# Keep example file in repo
+!.env.example
```

**Rationale**:
- `.env` is user-specific (not committed)
- `.env.example` is template (committed)
- Explicit `!.env.example` ensures example not ignored

### 5. Updated README.md (Quick Start Section)

**Added Sections**:
- **First Time Setup**: Copy `.env.example`, install dependencies
- **Start Development Environment**: `./dev.sh` workflow
- **Development Modes**: Docker vs Local mode explanation
- **Troubleshooting**: Port conflict resolution steps

**Before**:
```bash
# Start infrastructure (Icecast + coturn STUN/TURN server)
docker compose up -d

# Run signaling server
cd server && npm install && npm run dev  # ❌ PORT CONFLICT!
```

**After**:
```bash
# Create your local configuration
cp .env.example .env

# Install dependencies
cd server && npm install && cd ..
cd web && npm install && cd ..

# Start all services (Docker mode - recommended for most users)
./dev.sh  # ✅ NO CONFLICT!
```

### 6. Updated memory-bank/quick-start.md

**Added**:
- Development Modes section with examples
- Universal Development Script usage
- Manual commands for both Docker and Local modes
- Mode switching instructions

**Reorganized**:
- Moved Docker/local commands under "Development Modes"
- Clearer separation of automated (./dev.sh) vs manual workflows
- Preserved existing troubleshooting and reference sections

## Verification

### Docker Mode Testing

```bash
cp .env.example .env
cat .env  # DEV_MODE=docker ✅

docker compose down  # Clean slate
echo "n" | ./dev.sh  # Non-interactive test

# Results:
# ✅ All services started in Docker
# ✅ Signaling healthy: curl http://localhost:6736/health → {"status":"ok","uptime":6}
# ✅ Icecast accessible: curl http://localhost:6737/ → 200 OK
# ✅ coturn running (STUN port 3478)
```

### Local Mode Testing

```bash
# Switch to local mode
sed -i '' 's/DEV_MODE=docker/DEV_MODE=local/' .env

timeout 5 ./dev.sh || true  # 5 second test

# Results:
# ✅ Docker signaling stopped: docker compose ps → signaling not listed
# ✅ Icecast still running (healthy)
# ✅ coturn still running
# ✅ Local server started with --watch (hot reload enabled)
# ✅ Server logs: "OpenStudio signaling server listening on port 6736"
```

### Mode Switching Testing

```bash
# Switch to Docker mode
echo "1" | ./dev-switch.sh
cat .env  # DEV_MODE=docker ✅

# Switch to Local mode
echo "2" | ./dev-switch.sh
cat .env  # DEV_MODE=local ✅

# Results:
# ✅ Current mode detected correctly
# ✅ .env file updated correctly
# ✅ No .env.bak backup files left behind
# ✅ Clear success messages with next steps
```

### Port Conflict Resolution

**Before** (original error):
```bash
docker compose up -d
cd server && npm run dev
# Error: listen EADDRINUSE: address already in use :::6736 ❌
```

**After** (with dev.sh):
```bash
./dev.sh  # DEV_MODE=docker
# ✅ All services started, no conflict
# ✅ Clear instructions for viewing logs
# ✅ Signaling runs in Docker (production parity)
```

**After** (with local mode):
```bash
./dev-switch.sh  # Select option 2
./dev.sh
# ✅ Docker signaling stopped automatically
# ✅ Local server starts with hot reload
# ✅ Icecast/coturn still available
```

## Files Summary

**Created** (3 files, ~150 lines):
- `.env.example` (10 lines) - Configuration template
- `dev.sh` (63 lines) - Universal development script
- `dev-switch.sh` (38 lines) - Interactive mode switcher

**Modified** (3 files, ~80 lines changed):
- `.gitignore` (+4 lines) - Exclude `.env`, keep `.env.example`
- `README.md` (+62 lines) - Quick Start, Development Modes, Troubleshooting
- `memory-bank/quick-start.md` (+36 lines) - Development Modes documentation

**Total Impact**: 6 files, ~230 lines (150 new, 80 modified)

## User Workflow

### Recommended (Most Users - Docker Mode)

```bash
# First time setup
git clone <repo>
cd openstudio
cp .env.example .env  # DEV_MODE=docker by default
cd server && npm install && cd ..
cd web && npm install && cd ..

# Start development
./dev.sh  # All services in Docker

# In another terminal, start web client
cd web && python3 -m http.server 8086

# Open http://localhost:8086
```

### Core Development (Local Mode with Hot Reload)

```bash
# Switch to local mode
./dev-switch.sh  # Select option 2

# Start development
./dev.sh  # Docker signaling stops, local server starts

# Edit files in server/
# Server auto-restarts on file changes (--watch)

# When done, switch back to Docker
./dev-switch.sh  # Select option 1
```

### Troubleshooting Port Conflicts

```bash
# Check what's using port 6736
lsof -i :6736  # macOS/Linux
netstat -ano | findstr :6736  # Windows

# If Docker signaling is running
docker compose stop signaling

# If local dev server is running
# Press Ctrl+C or kill the process
```

## Acceptance Criteria

All criteria met:

- ✅ **No port conflict**: Users can follow README without EADDRINUSE error
- ✅ **Default to Docker**: .env.example has DEV_MODE=docker (production parity)
- ✅ **Hot reload available**: Local mode enables --watch for rapid iteration
- ✅ **Mode switching works**: dev-switch.sh correctly updates .env
- ✅ **Auto-creates .env**: dev.sh creates from example if missing
- ✅ **Clear documentation**: README explains both modes and when to use each
- ✅ **Icecast/coturn preserved**: Local mode only stops signaling container
- ✅ **Testing validated**: All three workflows tested (Docker, Local, Switching)
- ✅ **No breaking changes**: Existing docker compose commands still work
- ✅ **Helper scripts executable**: chmod +x applied to dev.sh and dev-switch.sh

## Key Decisions

### Why .env File Instead of CLI Flags?

**Considered**: `./dev.sh --mode=docker` or `./dev.sh docker`

**Chosen**: `.env` configuration file

**Rationale**:
- Persistent user preference (don't repeat on every invocation)
- Standard practice (follows dotenv pattern)
- IDE integration (editors can detect .env files)
- Supports additional config (LOCAL_SIGNALING_PORT)
- Explicit mode visibility (`cat .env` shows current setting)

### Why Docker as Default Mode?

**Rationale**:
- **Most users**: Testing, integration work, deployment validation
- **Production parity**: Same environment as deployment (fewer surprises)
- **Simpler setup**: No need to understand hot reload vs Docker differences
- **Fewer moving parts**: All services managed by Docker Compose
- **Clear upgrade path**: Users can switch to local mode when needed

### Why Shell Scripts Instead of npm Scripts?

**Considered**: `npm run dev:docker` and `npm run dev:local`

**Chosen**: Shell scripts (`./dev.sh`, `./dev-switch.sh`)

**Rationale**:
- **Project-level**: Affects all services, not just Node.js signaling server
- **Docker operations**: Easier to handle `docker compose` commands in shell
- **Cross-platform**: Bash scripts work on macOS/Linux (primary platforms)
- **Interactive features**: Menu prompts, log following easier in shell
- **No package.json pollution**: Keep package.json focused on application scripts

### Why Keep Icecast/coturn in Docker for Local Mode?

**Rationale**:
- **Signaling is the focus**: Hot reload most valuable for signaling server development
- **Icecast/coturn rarely change**: Media infrastructure stable, doesn't need iteration
- **Simplicity**: Fewer processes to manage (only one npm run dev)
- **Consistency**: Same media stack in both modes (fewer variables)
- **Dependencies**: coturn especially complex to run outside Docker

## Lessons Learned

### 1. sed -i Portability

**Issue**: `sed -i '' 's/old/new/' file` (macOS) vs `sed -i 's/old/new/' file` (Linux)

**Solution**: Used `.bak` extension for cross-platform compatibility
```bash
sed -i.bak 's/^DEV_MODE=.*/DEV_MODE=docker/' .env
rm -f .env.bak  # Clean up backup
```

**Result**: Works on both macOS and Linux

### 2. Environment Variable Export

**Issue**: Shell scripts create subshells, environment variables don't persist

**Discovery**: `export $(cat .env | grep -v '^#' | xargs)` works within script scope

**Limitation**: User changes to `.env` require re-running script (expected behavior)

### 3. Interactive Input Handling

**Challenge**: How to test interactive scripts (`read -p`) in automation?

**Solution**: `echo "n" | ./dev.sh` pipes input for non-interactive testing

**Best Practice**: Always provide non-interactive paths for CI/CD

### 4. Docker Compose Service Targeting

**Discovery**: `docker compose stop signaling` stops only signaling service

**Benefit**: Preserves Icecast/coturn containers (no unnecessary restart)

**Alternative**: `docker compose down` would stop everything (undesired)

### 5. .gitignore Negation Pattern

**Syntax**: `!.env.example` overrides previous `.env*` pattern

**Order matters**: Negation must come after the exclusion pattern

**Verification**: `git status` shows `.env.example` as tracked ✅

## Related Tasks

- **Task 201025** (Port Reconfiguration): Changed ports to 6736+ range, this task handles workflow conflict
- **Task 002** (Docker Verification): Established Docker infrastructure, this task adds local development option
- **Memory Bank Initialization**: Quick-start.md patterns extended with dual-mode workflow

## Future Considerations

### For v0.2+

**Windows Support**:
- Create `dev.bat` and `dev-switch.bat` for native Windows support
- PowerShell alternatives: `dev.ps1` for PowerShell users
- Cross-platform testing: GitHub Actions matrix (macOS, Linux, Windows)

**Enhanced Configuration**:
- Add `WEB_SERVER_PORT` for configurable web client port
- Add `ICECAST_PORT` and `COTURN_PORT` overrides (advanced users)
- Environment validation: Check port availability before starting

**Developer Experience**:
- `dev status` command: Show current mode, running services, port status
- `dev logs [service]` command: Unified log viewing across Docker/local
- `dev restart [service]` command: Service-specific restart without full cycle

### For Production

**Docker Compose Profiles**:
- `docker compose --profile dev` vs `docker compose --profile prod`
- Separate development and production configurations
- Profile-based service enablement (e.g., debug tools only in dev)

**Health Check Integration**:
- dev.sh waits for services to be healthy before showing "ready" message
- Automatic retry on startup failures
- Clear error messages if services fail health checks

**Monitoring**:
- Add `dev monitor` command: Live dashboard of CPU/memory/ports
- Integration with Docker stats: `docker stats` formatted output
- Alert on port conflicts before they happen

## Conclusion

Dual-mode development infrastructure successfully implemented. OpenStudio now provides flexible development workflows with clear guidance:

**Key Achievements**:
- ✅ **Zero port conflicts**: Users can follow README without EADDRINUSE errors
- ✅ **Production parity default**: Docker mode recommended for most users
- ✅ **Hot reload available**: Local mode for rapid backend development
- ✅ **Simple mode switching**: One command to change workflow
- ✅ **Auto-configuration**: Creates .env from example if missing
- ✅ **Clear documentation**: README and quick-start.md fully updated
- ✅ **Tested thoroughly**: All three workflows validated (Docker, Local, Switching)

**User Benefits**:
- **First-run success**: No more confusing port conflict errors
- **Flexible workflow**: Choose between production parity and rapid iteration
- **Clear guidance**: Documentation explains when to use each mode
- **Easy switching**: Change modes with one interactive command

**Status**: ✅ **Complete and Verified**
