# Task 004: Station Manifest Integration

**Date**: 2025-10-18
**Component**: Backend (Signaling Server)
**Estimated Hours**: 2
**Actual Hours**: ~2
**Status**: ✅ Complete

## Overview

Implemented configuration management for the OpenStudio signaling server. The server now loads and validates `station-manifest.json` at startup, exposing station information (including ICE server configuration) via a REST API endpoint for web clients.

## User Request

> Let's start on 004: @memory-bank/releases/0.1/tasks/004_station_manifest_integration.yml

User requested implementation of Task 004 from the release plan.

## Planning

### Task Specification Analysis

Read task specification from `004_station_manifest_integration.yml`:

**Requirements**:
- Load `station-manifest.json` on server startup
- Validate required fields (stationId, name, signaling.url, ice servers)
- Log clear errors if manifest is invalid
- Expose station info via `GET /api/station` endpoint
- Fall back to `station-manifest.sample.json` if main file missing (dev mode)

**Files to Create**:
- `server/lib/config-loader.js` - Configuration loader with fallback logic
- `server/lib/validate-manifest.js` - Field validation
- `station-manifest.json` - Main configuration file

**Files to Modify**:
- `server/server.js` - Load config on startup, add API endpoint

### Implementation Plan

**Presented to user**:

1. Create `station-manifest.sample.json` with correct schema (port 3000, not 8080)
2. Create `server/lib/validate-manifest.js` - Validate all required fields
3. Create `server/lib/config-loader.js` - Load with fallback to sample
4. Modify `server/server.js` - Load config before server starts, add `/api/station` endpoint
5. Update Dockerfile to copy manifest files from project root

**Design Decision - Include TURN Credentials in API Response**:
- **Q**: Should we include TURN credentials in `/api/station` response?
- **A**: Yes - web client needs them for WebRTC connections. This is local dev setup, credentials already in docker-compose.yml

**Design Decision - Fail Fast on Invalid Config**:
- Use `process.exit(1)` if manifest is invalid
- Prevents server from running with bad configuration
- Follows projectRules.md error handling patterns

**User Approval**: "yes"

## Implementation

### 1. Created `station-manifest.sample.json`

```json
{
  "stationId": "openstudio-dev",
  "name": "OpenStudio Development Station",
  "signaling": {
    "url": "ws://localhost:3000"
  },
  "ice": {
    "stun": [
      "stun:localhost:3478"
    ],
    "turn": [
      {
        "urls": "turn:localhost:3478",
        "username": "openstudio",
        "credential": "hackme"
      }
    ]
  }
}
```

**Note**: Port 3000 (not 8080) to match Task 003 decision.

### 2. Created `server/lib/validate-manifest.js`

**File**: `server/lib/validate-manifest.js` (103 lines)

**Purpose**: Validate station manifest schema and field formats

**Key Functions**:
- `validateManifest(manifest)` - Returns `{valid: boolean, errors: string[]}`
- `isValidWebSocketUrl(url)` - Checks for `ws://` or `wss://` prefix

**Validation Rules**:
- `stationId` - Must be non-empty string
- `name` - Must be non-empty string
- `signaling.url` - Must be valid WebSocket URL (ws:// or wss://)
- `ice.stun` - Must be array with at least one STUN server
- `ice.turn` - Optional array, but if present must have valid structure
- Each STUN URL must start with `stun:`
- Each TURN server must have `urls` field starting with `turn:`
- TURN username/credential are optional but must be strings if present

**Error Messages**: Clear, specific error messages for each validation failure

### 3. Created `server/lib/config-loader.js`

**File**: `server/lib/config-loader.js` (73 lines)

**Purpose**: Load and validate station manifest with fallback logic

**Key Features**:
- Try to load `station-manifest.json` first
- Fall back to `station-manifest.sample.json` if not found (with warning)
- Parse JSON with error handling
- Call validator before returning config
- Throw descriptive errors if validation fails

**Path Resolution**:
```javascript
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'station-manifest.json');
```

**Error Handling**:
- File not found → Fall back to sample (development mode)
- Both files missing → Throw error
- Invalid JSON → Throw error with parse details
- Validation failure → Throw error with all validation errors listed

### 4. Modified `server/server.js`

**Changes**:

**Import config loader**:
```javascript
import { loadConfig } from './lib/config-loader.js';
```

**Load config before server starts** (fail fast pattern):
```javascript
// Load and validate station manifest (fail fast if invalid)
let config;
try {
  config = loadConfig();
} catch (error) {
  logger.error('Failed to load station manifest:', error.message);
  process.exit(1);
}
```

**Add `/api/station` endpoint**:
```javascript
// Station info endpoint
if (req.method === 'GET' && req.url === '/api/station') {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    stationId: config.stationId,
    name: config.name,
    signaling: config.signaling,
    ice: config.ice
  }));
  return;
}
```

### 5. Updated Docker Configuration

**Modified `server/Dockerfile`**:

**Before**:
```dockerfile
COPY package*.json ./
RUN npm install
COPY . .
```

**After**:
```dockerfile
# Copy package files from server directory
COPY server/package*.json ./

# Install dependencies
RUN npm install

# Copy station manifest files from project root
COPY station-manifest*.json ../

# Copy application code from server directory
COPY server/ .
```

**Rationale**: Manifest files live in project root, need to be accessible at `../station-manifest.json` from server code.

**Modified `docker-compose.yml`**:

**Before**:
```yaml
signaling:
  build:
    context: ./server
    dockerfile: Dockerfile
```

**After**:
```yaml
signaling:
  build:
    context: .
    dockerfile: server/Dockerfile
```

**Rationale**: Build context must be project root to access manifest files.

## Testing

### Test 1: Server loads manifest without errors

**Command**:
```bash
sudo docker compose build signaling
sudo docker compose up -d signaling
sudo docker compose logs signaling --tail 20
```

**Expected**: Log shows successful manifest load

**Result**: ✅ PASS
```
[2025-10-18T17:06:04.252Z] [INFO] Loaded station manifest: OpenStudio Development Station (openstudio-dev)
[2025-10-18T17:06:04.260Z] [INFO] OpenStudio signaling server listening on port 3000
```

### Test 2: curl /api/station returns station info

**Command**:
```bash
curl -s http://localhost:3000/api/station | jq .
```

**Expected**: JSON response with stationId, name, signaling, ice configuration

**Result**: ✅ PASS
```json
{
  "stationId": "openstudio-dev",
  "name": "OpenStudio Development Station",
  "signaling": {
    "url": "ws://localhost:3000"
  },
  "ice": {
    "stun": [
      "stun:localhost:3478"
    ],
    "turn": [
      {
        "urls": "turn:localhost:3478",
        "username": "openstudio",
        "credential": "hackme"
      }
    ]
  }
}
```

### Test 3: Fallback to sample manifest works

**Command**:
```bash
mv station-manifest.json station-manifest.json.backup
sudo docker compose build signaling
sudo docker compose up -d signaling
sudo docker compose logs signaling --tail 10
```

**Expected**: Warning about using sample, server starts successfully

**Result**: ✅ PASS
```
[2025-10-18T17:25:00.423Z] [WARN] station-manifest.json not found, using station-manifest.sample.json
[2025-10-18T17:25:00.426Z] [INFO] Loaded station manifest from sample file (development mode)
[2025-10-18T17:25:00.432Z] [INFO] OpenStudio signaling server listening on port 3000
```

### Test 4: Corrupt manifest causes clear error

**Command**:
```bash
mv station-manifest.json.backup station-manifest.json
echo '{"stationId": "test"' > station-manifest.json
sudo docker compose build signaling
sudo docker compose up -d signaling
sudo docker compose logs signaling --tail 20
```

**Expected**: Clear error message, server exits

**Result**: ✅ PASS
```
[2025-10-18T19:46:07.143Z] [ERROR] Failed to load station manifest: Invalid JSON in manifest file: Unexpected end of JSON input
```

Server exits immediately (process.exit(1)), Docker restart policy retries, same error repeats.

**Cleanup**: Restored valid manifest, verified server starts successfully.

## Files Changed

### Created (3 files)
- `station-manifest.sample.json` - Sample configuration with development credentials
- `server/lib/validate-manifest.js` - 103 lines
- `server/lib/config-loader.js` - 73 lines

### Modified (3 files)
- `server/server.js` - Added config loading and `/api/station` endpoint (+22 lines)
- `server/Dockerfile` - Updated to copy manifest files from project root (+7/-4 lines)
- `docker-compose.yml` - Changed build context to project root (+2/-2 lines)

**Total**: +176 lines of code (excluding manifest JSON files)

## Acceptance Criteria Validation

All acceptance criteria from task specification met:

- ✅ Server reads station-manifest.json on startup
- ✅ Validates required fields (stationId, name, signaling.url, ice servers)
- ✅ Logs configuration errors clearly if manifest is invalid
- ✅ Exposes station info via GET /api/station endpoint
- ✅ Falls back to station-manifest.sample.json if main file missing (dev mode)

## Lessons Learned

### What Went Well

1. **Validation-First Approach**: Writing the validator before the loader ensured comprehensive error checking
2. **Clear Error Messages**: Validation returns array of specific errors, not generic "invalid config"
3. **Fallback Pattern**: Development mode fallback to sample reduces friction during setup
4. **Fail Fast**: Invalid config prevents server startup, no silent failures

### Challenges Overcome

1. **Docker Build Context**: Initial Dockerfile assumed build context was `./server`, but manifest files are in project root. Solution: Changed build context in docker-compose.yml to `.` and updated COPY paths.

2. **Path Resolution in ES Modules**: No `__dirname` in ES modules. Solution: Use `fileURLToPath(import.meta.url)` and `path.dirname()`.

### Design Decisions

1. **Full Config in API Response**: Include TURN credentials in `/api/station` response (web client needs them)
2. **Fail Fast on Invalid Config**: `process.exit(1)` prevents running with bad configuration
3. **Sample Fallback**: Convenience for development, warns but doesn't fail
4. **Port 3000 Standard**: Consistent with Task 003 decision, updated sample manifest accordingly

### Patterns Established

1. **Configuration Loading Pattern**: Separate validator and loader modules, fail fast on startup
2. **API Endpoint Pattern**: Simple route matching in HTTP request handler (will need routing library later)
3. **Docker Multi-Stage Context**: Build context at project root, copy from subdirectories as needed

## Next Steps

Task 005 (WebSocket Signaling Protocol) will use the loaded config to:
- Relay SDP offers/answers between peers
- Exchange ICE candidates
- Route messages to specific peers in rooms

The `/api/station` endpoint provides the web client with ICE server configuration needed for WebRTC peer connections.

## References

- Task specification: `memory-bank/releases/0.1/tasks/004_station_manifest_integration.yml`
- Project rules: `memory-bank/projectRules.md` (Error Handling Patterns)
- Quick start guide: `memory-bank/quick-start.md` (Station Manifest structure)
- Previous task: `181025_task_003_signaling_server_skeleton.md`
