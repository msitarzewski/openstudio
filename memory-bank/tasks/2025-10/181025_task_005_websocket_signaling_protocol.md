# Task 005: WebSocket Signaling Protocol

**Date**: 2025-10-18
**Component**: Backend (Signaling Server)
**Estimated Hours**: 4
**Actual Hours**: ~3
**Status**: ✅ Complete

## Overview

Implemented the WebSocket signaling protocol for coordinating WebRTC peer connections. The server now handles peer registration, validates signaling messages, and relays SDP offers/answers and ICE candidates between peers with comprehensive security checks.

## User Request

> Let's execute 005: memory-bank/releases/0.1/tasks/005_websocket_signaling_protocol.yml

User requested implementation of Task 005 from the release plan.

## Planning

### Task Specification Analysis

Read task specification from `005_websocket_signaling_protocol.yml`:

**Requirements**:
- Handle 'offer' messages and relay to target peer
- Handle 'answer' messages and relay to initiator
- Handle 'ice-candidate' messages and relay to peer
- Each message includes sender ID and target peer ID
- Invalid messages logged and rejected (not relayed)
- Message format documented in code comments

**Files to Create**:
- `server/lib/signaling-protocol.js` - Peer registry and message routing
- `server/lib/message-validator.js` - Message validation logic

**Files to Modify**:
- `server/lib/websocket-server.js` - Add message routing

### Implementation Plan

**Presented to user**:

1. Create `server/lib/message-validator.js` - Validation logic
   - `validateSignalingMessage(message, registeredPeerId)` - Validates message format and fields
   - Returns `{valid: boolean, errors: string[]}`
   - Checks: type, from, to fields exist
   - Checks: from === registeredPeerId (anti-spoofing)
   - Checks: type-specific fields (sdp or candidate)

2. Create `server/lib/signaling-protocol.js` - Connection registry & routing
   - `PeerRegistry` class - Manages peerId → WebSocket mappings
   - `registerPeer(peerId, ws)` - Register new peer
   - `unregisterPeer(peerId)` - Remove peer on disconnect
   - `getPeer(peerId)` - Look up peer connection
   - `relayMessage(message, fromPeerId)` - Route validated message to target

3. Modify `server/lib/websocket-server.js` - Integrate protocol
   - Import signaling protocol and validator
   - Create global PeerRegistry instance
   - Add `register` message handler
   - Update existing `handleMessage` to route offer/answer/ice-candidate
   - Track peer ID per connection
   - Unregister peer on disconnect

4. Write comprehensive automated test suite
   - 9 tests covering all acceptance criteria and error cases

**Architecture Decisions**:

1. **Peer Registration Pattern**:
   - Clients must register with a peer ID when connecting
   - Use a `register` message type: `{"type": "register", "peerId": "abc123"}`
   - Server maintains a Map of peerId → WebSocket connection

2. **Anti-Spoofing Security**:
   - Validate `from` matches sender's registered peer ID
   - Prevents peers from impersonating other peers
   - Critical for security in peer-to-peer messaging

3. **Duplicate Peer ID Handling**:
   - Reject second registration with error
   - First connection wins
   - Prevents ID conflicts

**User Approval**: "yes. Also write tests and execute them please."

## Implementation

### 1. Created `server/lib/message-validator.js`

**File**: `server/lib/message-validator.js` (136 lines)

**Purpose**: Validate signaling messages with security checks

**Key Functions**:
- `validateSignalingMessage(message, registeredPeerId)` - Main validation entry point
- `validateRegisterMessage(message, errors)` - Validate peer registration
- `validateOfferAnswerMessage(message, registeredPeerId, errors)` - Validate SDP exchange
- `validateIceCandidateMessage(message, registeredPeerId, errors)` - Validate ICE candidate

**Validation Rules**:
- **Register**: peerId must be non-empty string
- **Offer/Answer**:
  - Must have registered peer ID
  - from, to, sdp fields required
  - from must match registeredPeerId (anti-spoofing)
- **ICE Candidate**:
  - Must have registered peer ID
  - from, to, candidate fields required
  - from must match registeredPeerId
  - candidate must be an object

**Security Features**:
- Anti-spoofing: from field must match registered peer ID
- Fail closed: unregistered peers cannot send signaling messages
- Clear error messages for debugging

### 2. Created `server/lib/signaling-protocol.js`

**File**: `server/lib/signaling-protocol.js` (158 lines)

**Purpose**: Peer registry and message routing

**PeerRegistry Class**:
- `peers` - Map<peerId, WebSocket>
- `connections` - WeakMap<WebSocket, peerId> (for reverse lookup)

**Methods**:
- `registerPeer(peerId, ws)` - Register peer, returns {success, error?}
- `unregisterPeer(peerId)` - Remove peer by ID
- `unregisterByConnection(ws)` - Remove peer by WebSocket
- `getPeer(peerId)` - Get WebSocket for peer ID
- `getPeerId(ws)` - Get peer ID for WebSocket
- `hasPeer(peerId)` - Check if peer is registered
- `getPeerCount()` - Count of registered peers
- `getAllPeerIds()` - Array of all peer IDs

**relayMessage Function**:
- Validates target peer exists
- Checks target WebSocket is open (readyState === 1)
- Sends message to target peer
- Returns {success, error?}
- Logs relay actions

**Design Patterns**:
- Bidirectional lookup (Map + WeakMap for memory efficiency)
- Automatic cleanup with WeakMap (garbage collection friendly)
- First-registration-wins for duplicate IDs
- Comprehensive error reporting

### 3. Modified `server/lib/websocket-server.js`

**Changes**:

**Added imports**:
```javascript
import { PeerRegistry, relayMessage } from './signaling-protocol.js';
import { validateSignalingMessage } from './message-validator.js';

// Global peer registry
const peerRegistry = new PeerRegistry();
```

**Updated handleMessage function** (+57 lines):
```javascript
function handleMessage(ws, message) {
  // Get peer ID if registered
  const peerId = peerRegistry.getPeerId(ws);

  // Validate message
  const validation = validateSignalingMessage(message, peerId);
  if (!validation.valid) {
    const errorList = validation.errors.join(', ');
    logger.warn(`Invalid message from ${peerId || 'unregistered peer'}:`, errorList);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Invalid message: ${errorList}`
    }));
    return;
  }

  // Handle message by type
  switch (message.type) {
    case 'register':
      handleRegister(ws, message);
      break;

    case 'ping':
      // Respond with pong and current timestamp
      ws.send(JSON.stringify({
        type: 'pong',
        timestamp: Date.now()
      }));
      break;

    case 'offer':
    case 'answer':
    case 'ice-candidate':
      handleSignalingMessage(ws, message, peerId);
      break;

    default:
      logger.warn('Unknown message type:', message.type);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${message.type}`
      }));
  }
}
```

**Added handleRegister function**:
```javascript
function handleRegister(ws, message) {
  const result = peerRegistry.registerPeer(message.peerId, ws);

  if (result.success) {
    ws.send(JSON.stringify({
      type: 'registered',
      peerId: message.peerId
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      message: result.error
    }));
  }
}
```

**Added handleSignalingMessage function**:
```javascript
function handleSignalingMessage(ws, message, peerId) {
  const result = relayMessage(peerRegistry, message, peerId);

  if (!result.success) {
    ws.send(JSON.stringify({
      type: 'error',
      message: result.error
    }));
  }
  // Note: We don't send a success confirmation to avoid extra message traffic
  // The relay itself is the confirmation
}
```

**Updated disconnect handler**:
```javascript
ws.on('close', () => {
  // Unregister peer if registered
  peerRegistry.unregisterByConnection(ws);
  logger.info('WebSocket client disconnected:', clientIp);
});
```

### 4. Created `server/test-signaling.js`

**File**: `server/test-signaling.js` (429 lines)

**Purpose**: Comprehensive automated test suite for signaling protocol

**Test Cases** (9 tests, all passing):

1. **Peer registration** - Register peer, verify confirmation
2. **Duplicate peer ID rejection** - Second registration with same ID fails
3. **Offer relay from peer A to peer B** - SDP offer relayed correctly
4. **Answer relay from peer B to peer A** - SDP answer relayed correctly
5. **ICE candidate relay** - ICE candidate relayed correctly
6. **Unregistered peer cannot send offer** - Must register first
7. **Target peer not found error** - Clear error when target doesn't exist
8. **Spoofed "from" field rejection** - Anti-spoofing validation works
9. **Malformed message rejection** - Missing required fields rejected

**Test Infrastructure**:
- `createConnection()` - Create and wait for WebSocket connection
- `waitForMessage(ws, expectedType)` - Wait for specific message type
- `sendAndWaitFor(ws, message, expectedType)` - Send and wait for response
- `runTest(name, testFn)` - Test runner with error handling

**Key Testing Patterns**:
- Async connection setup with welcome message handling
- Parallel WebSocket connections for multi-peer tests
- Message interception for relay verification
- Clear error message validation

## Testing

### Test Execution

**Command**:
```bash
node server/test-signaling.js
```

**Results**: ✅ **9/9 PASSED**

```
========================================
WebSocket Signaling Protocol Tests
========================================

🧪 TEST: 1. Peer registration
✅ PASS: 1. Peer registration

🧪 TEST: 2. Duplicate peer ID rejection
✅ PASS: 2. Duplicate peer ID rejection

🧪 TEST: 3. Offer relay from peer A to peer B
✅ PASS: 3. Offer relay from peer A to peer B

🧪 TEST: 4. Answer relay from peer B to peer A
✅ PASS: 4. Answer relay from peer B to peer A

🧪 TEST: 5. ICE candidate relay
✅ PASS: 5. ICE candidate relay

🧪 TEST: 6. Unregistered peer cannot send offer
✅ PASS: 6. Unregistered peer cannot send offer

🧪 TEST: 7. Target peer not found error
✅ PASS: 7. Target peer not found error

🧪 TEST: 8. Spoofed "from" field rejection
✅ PASS: 8. Spoofed "from" field rejection

🧪 TEST: 9. Malformed message rejection
✅ PASS: 9. Malformed message rejection

========================================
Test Summary
========================================
Total: 9
✅ Passed: 9
❌ Failed: 0
========================================
```

### Test Coverage

All acceptance criteria validated with automated tests:
- ✅ Server handles 'offer' messages and relays to target peer
- ✅ Server handles 'answer' messages and relays to initiator
- ✅ Server handles 'ice-candidate' messages and relays to peer
- ✅ Each message includes sender ID and target peer ID
- ✅ Invalid messages logged and rejected (not relayed)
- ✅ Message format documented in code comments

## Message Format Documentation

### Register
```javascript
// Client → Server
{
  "type": "register",
  "peerId": "peer-a-id"
}

// Server → Client (success)
{
  "type": "registered",
  "peerId": "peer-a-id"
}

// Server → Client (error)
{
  "type": "error",
  "message": "Peer ID \"peer-a-id\" is already registered"
}
```

### Offer
```javascript
// Peer A → Server
{
  "type": "offer",
  "from": "peer-a-id",
  "to": "peer-b-id",
  "sdp": "v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\n..."
}

// Server → Peer B (relay)
{
  "type": "offer",
  "from": "peer-a-id",
  "to": "peer-b-id",
  "sdp": "v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\n..."
}
```

### Answer
```javascript
// Peer B → Server
{
  "type": "answer",
  "from": "peer-b-id",
  "to": "peer-a-id",
  "sdp": "v=0\r\no=- 789012 2 IN IP4 127.0.0.1\r\n..."
}

// Server → Peer A (relay)
{
  "type": "answer",
  "from": "peer-b-id",
  "to": "peer-a-id",
  "sdp": "v=0\r\no=- 789012 2 IN IP4 127.0.0.1\r\n..."
}
```

### ICE Candidate
```javascript
// Peer A → Server
{
  "type": "ice-candidate",
  "from": "peer-a-id",
  "to": "peer-b-id",
  "candidate": {
    "candidate": "candidate:1 1 UDP 2130706431 192.168.1.100 54321 typ host",
    "sdpMLineIndex": 0,
    "sdpMid": "audio"
  }
}

// Server → Peer B (relay)
{
  "type": "ice-candidate",
  "from": "peer-a-id",
  "to": "peer-b-id",
  "candidate": {
    "candidate": "candidate:1 1 UDP 2130706431 192.168.1.100 54321 typ host",
    "sdpMLineIndex": 0,
    "sdpMid": "audio"
  }
}
```

### Error Responses
```javascript
// Unregistered peer
{
  "type": "error",
  "message": "Invalid message: Peer must register before sending offer/answer messages"
}

// Target peer not found
{
  "type": "error",
  "message": "Target peer \"peer-b-id\" is not connected"
}

// Spoofed from field
{
  "type": "error",
  "message": "Invalid message: Field \"from\" must match registered peer ID (expected: peer-a-id, got: peer-b-id)"
}

// Malformed message
{
  "type": "error",
  "message": "Invalid message: Missing or invalid \"sdp\" field (must be non-empty string)"
}
```

## Files Changed

### Created (3 files)
- `server/lib/message-validator.js` - 136 lines
- `server/lib/signaling-protocol.js` - 158 lines
- `server/test-signaling.js` - 429 lines

### Modified (1 file)
- `server/lib/websocket-server.js` - +74 lines

**Total**: +797 lines (294 production + 429 test + 74 modified)

## Acceptance Criteria Validation

All acceptance criteria from task specification met:

- ✅ Server handles 'offer' messages and relays to target peer
- ✅ Server handles 'answer' messages and relays to initiator
- ✅ Server handles 'ice-candidate' messages and relays to peer
- ✅ Each message includes sender ID and target peer ID
- ✅ Invalid messages logged and rejected (not relayed)
- ✅ Message format documented in code comments

## Lessons Learned

### What Went Well

1. **Security-First Design**: Anti-spoofing validation prevents peer impersonation
2. **Comprehensive Testing**: 9 automated tests caught all edge cases
3. **Clear Error Messages**: Validation errors are specific and actionable
4. **Clean Architecture**: Separate validator, registry, and routing modules
5. **Test-Driven Development**: Tests written alongside implementation, all passed first run after fixing test harness

### Challenges Overcome

1. **Test Harness Race Condition**: Welcome message arrived before test listener
   - **Problem**: Tests waited for connection to open, then tried to listen for welcome message (already sent)
   - **Solution**: Set up message listener immediately when creating WebSocket, before waiting for connection to open
   - **Pattern**: Async connection setup with pre-registered event handlers

2. **Message Relay Testing**: Need to verify message arrives at correct peer
   - **Problem**: `sendAndWaitFor` helper waits for response on sender's connection
   - **Solution**: Set up listener on target peer before sender sends message
   - **Pattern**: Parallel promise setup for cross-peer message verification

### Design Decisions

1. **Peer ID Source**: Clients provide their own IDs (not server-generated)
   - **Rationale**: Simpler for initial implementation, client has context for meaningful IDs
   - **Future**: Server can generate UUIDs if needed in room management (Task 006)

2. **Duplicate ID Handling**: First registration wins, second rejected
   - **Rationale**: Clear ownership, prevents ID theft
   - **Alternative**: Could disconnect first peer, but more disruptive

3. **No Broadcast on Disconnect**: Peers unregistered silently
   - **Rationale**: Room management (Task 006) will handle participant notifications
   - **Decision**: Keep signaling protocol minimal, rooms handle coordination

4. **No Relay Confirmation**: Success indicated by receiving relayed message
   - **Rationale**: Reduces message traffic, relay itself is confirmation
   - **Error Case**: Only send error response if relay fails

### Patterns Established

1. **Validation Pattern**: Separate validator module with accumulating errors
   - Returns `{valid: boolean, errors: string[]}`
   - Collects all errors, not just first one
   - Specific error messages for debugging

2. **Registry Pattern**: Bidirectional lookup with Map + WeakMap
   - Map for peerId → WebSocket (primary lookup)
   - WeakMap for WebSocket → peerId (reverse lookup, GC-friendly)
   - Automatic cleanup when WebSocket is garbage collected

3. **Security Pattern**: Anti-spoofing with registered peer ID validation
   - All signaling messages validate `from === registeredPeerId`
   - Prevents peer impersonation attacks
   - Critical for trustless peer-to-peer messaging

4. **Testing Pattern**: Automated WebSocket test suite
   - Parallel connections for multi-peer scenarios
   - Message interception for relay verification
   - Clear test result reporting with emojis

## Next Steps

Task 006 (Room Management System) will use this signaling protocol to:
- Create rooms with unique room IDs
- Track participants per room
- Route messages only to peers in same room
- Broadcast join/leave events to room participants
- Support multiple concurrent rooms on same server

The peer registry established here provides the foundation for room-scoped message routing.

## References

- Task specification: `memory-bank/releases/0.1/tasks/005_websocket_signaling_protocol.yml`
- System patterns: `memory-bank/systemPatterns.md` (Signaling Server - SDP exchange coordination)
- Signal flow: `memory-bank/SIGNAL_FLOW.md` (Session bring-up)
- Previous task: `181025_task_004_station_manifest_integration.md`
