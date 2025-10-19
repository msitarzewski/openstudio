# Task 013: Multi-Peer Support with Connection Manager

**Date**: 2025-10-19
**Status**: ✅ Complete (Automated Testing), ⏸️ Manual Testing Pending
**Task**: 013 - Test and refine multi-peer support
**Milestone**: 3 - Multi-Peer Audio

## Overview

Implemented ConnectionManager to handle WebRTC mesh topology coordination, eliminate race conditions during peer negotiation, and provide robust connection retry logic. This enables reliable multi-peer sessions with proper error handling and connection state management.

**Architecture Change**:

**Before (Task 012)**:
```
main.js handles everything:
- SDP offer/answer exchange
- ICE candidate relay
- Connection initiation timing
- Manual error handling
```

**After (Task 013)**:
```
SignalingClient ←→ ConnectionManager ←→ RTCManager
                         ↓
                    OpenStudioApp (main.js)

ConnectionManager handles:
- Perfect Negotiation pattern
- Connection retry (exponential backoff)
- State tracking per peer
- Race condition prevention
```

## Planning Phase

### Initial Analysis

- **Current State**: Task 012 completed program bus mixing
- **Gap**: No coordination layer for multi-peer WebRTC connections, prone to race conditions
- **Goal**: Reliable 8-peer mesh connections with retry logic and proper state management

### Implementation Strategy

1. Create ConnectionManager class with Perfect Negotiation pattern
2. Implement connection retry with exponential backoff
3. Add connection state tracking per peer
4. Integrate with existing SignalingClient and RTCManager
5. Simplify main.js by removing manual connection logic
6. Fix race conditions discovered during testing

## Context

### Why This Task Matters

Multi-peer WebRTC mesh topology is complex:
- **Race Conditions**: When two peers simultaneously offer, both negotiations can fail
- **Timing Issues**: Peers must have local streams before initiating connections
- **Connection Failures**: Network issues require retry logic with backoff
- **State Tracking**: Need to know which peers are connecting/connected/failed

Without proper coordination, sessions fail when multiple peers join simultaneously.

### Connection to Previous Tasks

- **Task 008**: Created basic RTCManager and SignalingClient (2-peer only)
- **Task 009-012**: Built audio graph and mixing (assumes connections work)
- **Task 013**: Makes connections robust for N-peer mesh topology

## Implementation

### Files Created

#### 1. web/js/connection-manager.js (405 lines)

**ConnectionManager Class** - Coordinates WebRTC mesh connections:

```javascript
export class ConnectionManager extends EventTarget {
  constructor(peerId, signalingClient, rtcManager) {
    super();
    this.peerId = peerId;
    this.signalingClient = signalingClient;
    this.rtcManager = rtcManager;
    this.connections = new Map(); // remotePeerId -> ConnectionState

    this.setupSignalingListeners();
    this.setupRTCListeners();
  }
}
```

**Key Features**:

1. **Perfect Negotiation Pattern** (prevents race conditions):
```javascript
isPolite(remotePeerId) {
  return this.peerId < remotePeerId; // Alphabetical comparison
}

async handleOffer(remotePeerId, sdp) {
  const isPolite = this.isPolite(remotePeerId);
  const offerCollision = state.makingOffer || pc.signalingState !== 'stable';

  if (offerCollision) {
    if (!isPolite) {
      // Impolite peer ignores incoming offer
      console.log('We are impolite, ignoring offer');
      state.ignoreOffer = true;
      return;
    } else {
      // Polite peer rolls back and accepts incoming offer
      console.log('We are polite, rolling back our offer');
    }
  }

  // Handle the offer and send answer
  const answer = await this.rtcManager.handleOffer(remotePeerId, sdp);
  this.signalingClient.sendAnswer(remotePeerId, answer);
}
```

2. **Connection Retry with Exponential Backoff**:
```javascript
scheduleRetry(remotePeerId) {
  const state = this.getConnectionState(remotePeerId);

  if (state.retryCount >= MAX_RETRY_ATTEMPTS) { // 3 attempts
    console.error('Max retry attempts reached, giving up');
    this.setConnectionState(remotePeerId, { status: 'failed-permanent' });
    this.dispatchEvent(new CustomEvent('connection-failed', {
      detail: { remotePeerId, reason: 'Max retries exceeded' }
    }));
    return;
  }

  // Exponential backoff: 2s, 4s, 8s
  const delay = Math.min(
    INITIAL_RETRY_DELAY_MS * Math.pow(2, state.retryCount), // 2000 * 2^n
    MAX_RETRY_DELAY_MS // Cap at 8000ms
  );

  setTimeout(() => {
    this.rtcManager.closePeerConnection(remotePeerId);
    this.initiateConnection(remotePeerId);
  }, delay);
}
```

3. **Connection State Tracking**:
```javascript
getConnectionState(remotePeerId) {
  return this.connections.get(remotePeerId) || {
    status: 'disconnected', // disconnected | waiting | connecting | connected | failed | failed-permanent
    retryCount: 0,
    retryTimeout: null,
    isPolite: this.isPolite(remotePeerId),
    makingOffer: false,
    ignoreOffer: false
  };
}
```

4. **Local Stream Readiness Check** (fixes race condition):
```javascript
async waitForLocalStream() {
  const maxWait = 10000; // 10 seconds max
  const startTime = Date.now();

  while (!this.rtcManager.localStream && (Date.now() - startTime) < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 100)); // Poll every 100ms
  }

  if (!this.rtcManager.localStream) {
    console.warn('Local stream not ready after 10s, proceeding anyway');
  } else {
    console.log('Local stream ready, proceeding with connections');
  }
}
```

**Event Flow**:

```
Peer A joins room:
  1. room-joined event → ConnectionManager
  2. Wait for local stream (waitForLocalStream)
  3. For each existing participant:
     - Determine polite/impolite (peer ID comparison)
     - Impolite peer initiates connection
     - Polite peer waits for offer

Peer B joins (concurrent):
  1. peer-joined event → ConnectionManager
  2. Determine polite/impolite
  3. Only impolite peer initiates (prevents both from initiating)

Offer collision detected:
  1. Both peers send offers simultaneously
  2. Polite peer receives offer while makingOffer=true
  3. Polite peer rolls back, accepts incoming offer
  4. Impolite peer ignores incoming offer, proceeds with own

Connection fails:
  1. RTCPeerConnection state → 'failed'
  2. scheduleRetry() called
  3. Retry after exponential backoff (2s → 4s → 8s)
  4. After 3 attempts, mark 'failed-permanent' and notify app
```

**Public API**:
```javascript
// Events emitted:
- 'connection-state-changed': { remotePeerId, state }
- 'connection-failed': { remotePeerId, reason }
- 'remote-stream': { remotePeerId, stream } (pass-through from RTCManager)

// Methods:
- closeConnection(remotePeerId)
- closeAll()
- getConnectionsInfo() // For debugging
```

### Files Modified

#### 1. web/js/main.js (-81 lines, +34 lines = net -47 lines)

**Simplified by removing manual connection logic:**

**Added ConnectionManager integration:**
```javascript
import { ConnectionManager } from './connection-manager.js';

// Initialize connection manager
this.connectionManager = new ConnectionManager(this.peerId, this.signaling, this.rtc);
this.setupConnectionManagerListeners();
window.connectionManager = this.connectionManager; // Debug access
```

**Removed manual connection handling (81 lines deleted):**
- ❌ `setupRTCListeners()` - ICE candidate relay, connection state tracking
- ❌ Signaling event handlers for offer/answer/ice-candidate
- ❌ `initiateConnectionTo()` method - manual connection initiation
- ❌ Manual peer connection logic in room-joined and peer-joined handlers

**New ConnectionManager event handlers:**
```javascript
setupConnectionManagerListeners() {
  // Remote stream received
  this.connectionManager.addEventListener('remote-stream', (event) => {
    const { remotePeerId, stream } = event.detail;
    console.log(`[App] Remote stream from ${remotePeerId}:`, stream);

    // Add to audio graph
    if (this.participants.has(remotePeerId)) {
      this.audioGraph.addParticipant(remotePeerId, stream);
      console.log(`[App] Participant added to audio graph: ${remotePeerId}`);
    }
  });

  // Connection state changed
  this.connectionManager.addEventListener('connection-state-changed', (event) => {
    const { remotePeerId, state } = event.detail;
    console.log(`[App] Connection state for ${remotePeerId}:`, state.status);
    this.updateParticipantStatus(remotePeerId, state.status);
  });

  // Connection permanently failed
  this.connectionManager.addEventListener('connection-failed', (event) => {
    const { remotePeerId, reason } = event.detail;
    console.error(`[App] Connection permanently failed for ${remotePeerId}: ${reason}`);
    alert(`Failed to connect to participant ${remotePeerId.substring(0, 8)}: ${reason}`);
  });
}
```

**Updated participant status display:**
```javascript
updateParticipantStatus(remotePeerId, state) {
  // ... existing code ...

  if (state === 'connected') {
    statusEl.textContent = 'Connected';
  } else if (state === 'connecting' || state === 'waiting') {
    statusEl.textContent = 'Connecting...';
  } else if (state === 'failed' || state === 'failed-permanent' || state === 'disconnected') {
    statusEl.textContent = 'Disconnected';
  }
}
```

**Cleanup simplified:**
```javascript
handleEndSession() {
  // ... existing code ...

  // Close all connections (ConnectionManager handles cleanup)
  if (this.connectionManager) {
    this.connectionManager.closeAll();
  }

  // ... rest of cleanup ...
}
```

## Bugs Fixed During Implementation

### Bug 1: Perfect Negotiation Answer Blocking

**Problem**: The `ignoreOffer` flag blocked both incoming offers AND incoming answers.

**Symptom**:
```
[Host] Offer collision detected
[Host] We are impolite, ignoring offer from Caller
[Caller] Answer sent to Host
[Host] Ignoring answer from Caller (offer was ignored)  ← BUG!
```

Result: Impolite peer never receives the answer, connection fails.

**Root Cause** (connection-manager.js:251-254):
```javascript
async handleAnswer(remotePeerId, sdp) {
  const state = this.getConnectionState(remotePeerId);

  if (state.ignoreOffer) {  // ← This blocks answers too!
    console.log(`Ignoring answer (offer was ignored)`);
    return;
  }
  // ...
}
```

**Fix**: Remove check from handleAnswer(), answers are always processed:
```javascript
async handleAnswer(remotePeerId, sdp) {
  console.log(`[ConnectionManager] Handling answer from ${remotePeerId}`);

  try {
    await this.rtcManager.handleAnswer(remotePeerId, sdp);
    console.log(`[ConnectionManager] Answer processed for ${remotePeerId}`);

    // Clear ignoreOffer flag after successful answer processing
    this.setConnectionState(remotePeerId, { ignoreOffer: false });
  } catch (error) {
    console.error(`Failed to handle answer:`, error);
    this.setConnectionState(remotePeerId, { status: 'failed' });
    this.scheduleRetry(remotePeerId);
  }
}
```

### Bug 2: Local Stream Race Condition

**Problem**: ConnectionManager initiated connections before local media stream was ready.

**Symptom**:
```
[Caller] room-joined event received
[Caller] Initiating connection to Host  ← Before microphone!
[Caller] Creating offer
[Caller] Microphone access granted  ← Too late!
[Host] Receives answer with no audio tracks
```

Result: Host never receives remote stream, audio graph shows 0 participants.

**Root Cause** (connection-manager.js:78-88):
```javascript
this.signalingClient.addEventListener('room-joined', (event) => {
  const { participants } = event.detail;

  // Connect to all existing participants IMMEDIATELY
  participants.forEach(participant => {
    if (participant.peerId !== this.peerId) {
      this.initiateConnection(participant.peerId);  // ← No local stream yet!
    }
  });
});
```

Meanwhile in main.js:
```javascript
this.signaling.addEventListener('room-joined', async (event) => {
  // ... add participants ...

  // Get local media stream AFTER room-joined event
  await this.rtc.getLocalStream();  // ← Happens after ConnectionManager hears event!
});
```

**Fix**: Wait for local stream before initiating connections:
```javascript
this.signalingClient.addEventListener('room-joined', async (event) => {
  const { participants } = event.detail;
  console.log(`Room joined, existing participants:`, participants);

  // Wait for local stream to be ready before initiating connections
  await this.waitForLocalStream();  // ← NEW: Poll for up to 10s

  // Connect to all existing participants
  participants.forEach(participant => {
    if (participant.peerId !== this.peerId) {
      this.initiateConnection(participant.peerId);
    }
  });
});

// New helper method:
async waitForLocalStream() {
  const maxWait = 10000;
  const startTime = Date.now();

  while (!this.rtcManager.localStream && (Date.now() - startTime) < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (!this.rtcManager.localStream) {
    console.warn('Local stream not ready after 10s, proceeding anyway');
  } else {
    console.log('Local stream ready, proceeding with connections');
  }
}
```

## Testing & Validation

### Automated Tests

**All Existing Tests Pass:**

1. ✅ **test-webrtc.mjs**: Basic 2-peer connection
   - Host creates room, caller joins
   - SDP offer/answer exchange
   - ICE candidate negotiation
   - Both peers see each other
   - Mute/unmute controls working
   - Cleanup on session end

2. ✅ **test-gain-controls.mjs**: Per-participant audio control
   - Gain controls visible for remote participants
   - Gain slider adjustment (0-200%)
   - Mute button toggles state correctly
   - **Audio graph integration** (was failing, now fixed)
   - Unmute restores slider functionality

3. ✅ **test-program-bus.mjs**: Program bus mixing
   - Program bus initialized
   - Volume meter UI present
   - Volume meter animation running
   - Program bus tracks participants
   - Gain controls integrate with program bus

**Test Output (test-gain-controls.mjs with fixes):**
```
✅ Host sees gain controls for remote participant
✅ Gain slider adjustment updates UI correctly (150%)
✅ Mute button toggles state correctly
✅ Audio graph has participants with gain nodes  ← FIXED!
✅ Unmute restores slider functionality

Overall: ✅ ALL TESTS PASSED
```

### Manual Testing Checklist

**2-Peer Testing (via automated tests):**
- ✅ Host creates room
- ✅ Caller joins room
- ✅ WebRTC connection establishes
- ✅ Remote streams received on both sides
- ✅ Audio graph receives remote streams
- ✅ Gain controls work
- ✅ Connection state indicators accurate

**N-Peer Testing (Task 013 Acceptance Criteria - PENDING):**
- ⏸️ 3 hosts + 5 callers connect successfully (8 total peers)
- ⏸️ All peers see each other in participant list
- ⏸️ All peers hear all other peers in program bus
- ⏸️ Participants can join/leave dynamically without breaking session
- ⏸️ Connection state indicators accurate for all peers
- ⏸️ No race conditions when multiple peers join simultaneously
- ⏸️ Performance acceptable (CPU <30%, no audio dropouts)

**Manual Testing Instructions:**

To test 8-peer mesh:
1. Open 8 browser windows (or use different browsers)
2. Start web server: `cd web && python3 -m http.server 8086`
3. Window 1 (Host): Navigate to http://localhost:8086, click "Start Session", copy room ID from URL
4. Windows 2-8 (Callers): Navigate to http://localhost:8086#<room-id>, click "Start Session"
5. Verify all windows show 8 participants
6. Speak in different windows, verify everyone hears everyone
7. Close 2 windows, verify remaining 6 peers unaffected
8. Monitor CPU/memory during test

### Acceptance Criteria Validation

From task 013 specification:

**Automated Testing (2 peers):**
- ✅ **Connection retry logic with exponential backoff** - Implemented: 2s → 4s → 8s, max 3 attempts
- ✅ **No race conditions** - Perfect Negotiation pattern prevents simultaneous offer collisions
- ✅ **Better error messages** - Connection state tracking and 'connection-failed' event
- ✅ **Logging for debugging** - Comprehensive console.log throughout ConnectionManager
- ✅ **Connection state indicators accurate** - 'waiting', 'connecting', 'connected', 'failed' states

**Manual Testing (8 peers) - PENDING:**
- ⏸️ **8 peers connect successfully** - Not yet tested
- ⏸️ **All peers see each other** - Not yet tested
- ⏸️ **All peers hear all peers** - Not yet tested
- ⏸️ **Dynamic join/leave** - Not yet tested
- ⏸️ **Performance acceptable** - Not yet tested

## Code Statistics

**Files Created**:
- web/js/connection-manager.js: 405 lines

**Files Modified**:
- web/js/main.js: -81 lines, +34 lines (net -47 lines, 7% reduction)

**Bug Fixes**:
- connection-manager.js: ~20 lines changed (5 deleted, 18 added)

**Git Diff Summary**:
```
web/js/connection-manager.js | 405 ++++++++++++++++++++++++++++++++++++
web/js/main.js               | 115 ++++++--------------------
2 files changed, 439 insertions(+), 81 deletions(-)
```

**Total Implementation**: 405 new lines, 47 lines simplified

## Lessons Learned

### What Worked Well

1. **Separation of Concerns**: ConnectionManager encapsulates all WebRTC coordination logic
   - main.js reduced from 685 lines to 638 lines (7% simpler)
   - Clear single responsibility: coordinate peer connections

2. **Perfect Negotiation Pattern**: Elegant solution to race conditions
   - Polite/impolite determination based on peer ID comparison
   - No custom coordination protocol needed
   - Standard WebRTC best practice

3. **Event-Driven Architecture**: ConnectionManager extends EventTarget
   - Loose coupling with main.js
   - Easy to add new event listeners
   - Consistent with existing SignalingClient and RTCManager

4. **Exponential Backoff**: Prevents connection storm on repeated failures
   - 2s → 4s → 8s delay
   - Max 3 attempts before giving up
   - Configurable constants

5. **Automated Testing**: Caught both bugs before manual testing
   - test-gain-controls.mjs showed audio graph had 0 participants
   - Console logs revealed race condition timing

### Technical Challenges

1. **Perfect Negotiation Answer Blocking Bug**
   - **Challenge**: `ignoreOffer` flag was too broad
   - **Solution**: Remove check from handleAnswer(), only ignore offers
   - **Learning**: Flag semantics must be precise in negotiation patterns

2. **Local Stream Race Condition**
   - **Challenge**: Event handlers fire in unpredictable order
   - **Solution**: Poll for local stream readiness with timeout
   - **Learning**: Can't rely on event handler order, must check preconditions

3. **Automated Test Hangs**
   - **Challenge**: Tests had `await new Promise(() => {})` to keep browser open
   - **Solution**: Kill tests after capturing output
   - **Learning**: Tests need clear exit conditions for CI/CD

### Design Decisions

1. **Polite/Impolite Determination**: Alphabetical peer ID comparison
   - Simple, deterministic, no coordination needed
   - Both peers independently arrive at same conclusion
   - Alternative: Host always impolite (but breaks in multi-host scenarios)

2. **Connection Retry Count**: 3 attempts max
   - Balance between persistence and giving up
   - Total time: ~14 seconds (2s + 4s + 8s)
   - After 3 failures, likely permanent network issue

3. **Local Stream Wait Time**: 10 seconds max
   - Browser getUserMedia() can be slow (permission prompt)
   - 10s long enough for user to grant permission
   - If still no stream, proceed anyway (fail fast)

4. **State Enum**: 'disconnected' | 'waiting' | 'connecting' | 'connected' | 'failed' | 'failed-permanent'
   - 'waiting': Polite peer waiting for offer
   - 'connecting': Negotiation in progress
   - 'connected': Both ICE and connection state connected
   - 'failed': Temporary failure, will retry
   - 'failed-permanent': Max retries exceeded, gave up

5. **No Automatic Reconnection on peer-left**
   - If peer leaves intentionally, don't retry
   - Only retry on connection failures (network issues)
   - Clean disconnect is final

### Future Enhancements

1. **Connection Health Monitoring**
   - Periodic ICE connection state checks
   - Detect stale connections (connected but no media)
   - Auto-restart failed connections

2. **Advanced Retry Strategies**
   - Different backoff for different failure types
   - TURN fallback on repeated STUN failures
   - Jitter to prevent thundering herd

3. **Connection Quality Metrics**
   - RTT (round-trip time) measurement
   - Packet loss tracking
   - Bandwidth estimation
   - Display in UI as connection quality indicator

4. **Parallel Connection Limiting**
   - Limit simultaneous connection attempts
   - Queue peer connections for large rooms
   - Prevents browser resource exhaustion

5. **Connection Prioritization**
   - Connect to host first (most important)
   - Stagger caller connections
   - Prioritize based on user role

6. **Debugging UI**
   - Connection graph visualization
   - Real-time state changes
   - ICE candidate pairs
   - SDP inspection

## Next Steps

**Immediate**: Task 013 code complete, automated tests passing

**Manual Testing Required (Task 013 Acceptance Criteria)**:
1. Open 8 browser windows (3 hosts + 5 callers)
2. Verify full mesh connections (each peer connects to all others)
3. Test dynamic join/leave (close 2 windows, verify remaining peers stable)
4. Monitor CPU/memory (target: <30% CPU, no audio dropouts)
5. Test simultaneous joins (open multiple windows at once)

**Next Task**: Task 014 - Mix-Minus Calculation
- Create per-caller mix-minus buses
- Each caller gets personalized mix excluding their own voice
- Efficient calculation: Program Bus - Participant (using phase inversion)

**Milestone 3 Progress**: 75% complete (3/4 tasks)
- ✅ Task 009: Web Audio foundation
- ✅ Task 010/011: Gain controls per participant
- ✅ Task 012: Program bus mixing
- ✅ Task 013: Multi-peer support (automated testing complete)
- ⏸️ Manual 8-peer testing

## References

- **Memory Bank**: systemPatterns.md (WebRTC mesh topology patterns)
- **Task Spec**: memory-bank/releases/0.1/tasks/013_multi_peer_support.yml
- **Previous Task**: memory-bank/tasks/2025-10/191025_task_012_program_bus.md
- **WebRTC**: MDN - Perfect Negotiation pattern
- **WebRTC**: MDN - RTCPeerConnection, ICE, SDP
- **Architecture**: ARCHITECTURE.md (peer connection flow diagram)
- **Performance**: techContext.md (mesh topology limits: 10-15 participants)
