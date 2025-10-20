# Task 016: Mix-Minus Testing (Pre-Validation Phase)

**Date**: 2025-10-20
**Status**: Preparation Complete, Manual Testing Pending
**Component**: Integration Testing
**Estimated Hours**: 4 hours (2 hours prep completed, 2 hours manual testing pending)

## Overview

Task 016 validates that OpenStudio's mix-minus system correctly prevents self-echo for all participants in a multi-person session. This is the most critical acceptance test in Release 0.1 - if this passes, OpenStudio delivers on its core promise.

**This document covers**: Test infrastructure preparation and automated pre-validation (Phase 1)
**Pending**: Manual 6-participant testing session (Phase 2)

## Context

### Why This Task Matters

Mix-minus is the technical centerpiece of professional broadcast studios. Without it, callers hear themselves with network latency (echo/feedback), making the system unusable. This is the #1 UX failure mode for virtual studios.

**This test validates**:
- Each participant hears all others EXCEPT themselves
- No echo or feedback during conversation
- Audio quality is clear (no dropouts/distortion)
- System remains stable for 10+ minute sessions
- Mix-minus updates correctly when participants join/leave

### Dependencies

- Task 015 (Return Feed Routing) complete
- All automated tests passing
- Infrastructure operational (signaling server, web server, STUN/TURN)

## Planning

### Test Strategy

**Two-Phase Approach**:

**Phase 1: Automated Pre-Validation** (Completed ✅)
- Run all 6 automated Playwright tests
- Verify system readiness before gathering participants
- Identify and fix critical bugs
- Document test protocol

**Phase 2: Manual Testing** (Pending ⏸️)
- 6 participants (3 hosts + 3 callers) with headphones
- Follow structured test protocol
- 45-60 minute session
- Document results and quality assessment

### Test Scope

**In Scope**:
- 6-participant simultaneous audio
- Self-echo validation (critical)
- Audio quality assessment (subjective)
- Session stability (10+ minutes)
- Join/leave edge cases
- Latency measurement (clap test)

**Out of Scope**:
- 8+ participant stress testing (deferred to future task)
- Cross-browser testing (Chrome only for MVP)
- Network resilience testing (deferred)
- Performance profiling (separate task)

## Implementation

### Artifacts Created

#### 1. Mix-Minus Test Protocol

**File**: `docs/testing/mix-minus-test-protocol.md` (287 lines)

**Contents**:
- Prerequisites and technical requirements
- Pre-test validation checklist
- 6-phase test procedure:
  - Phase 1: Basic Connectivity (5 min)
  - Phase 2: Self-Echo Validation (10 min) - CRITICAL
  - Phase 3: Audio Quality Assessment (5 min)
  - Phase 4: Stability Test (10 min)
  - Phase 5: Join/Leave Edge Cases (10 min)
  - Phase 6: Stress Test (5 min, optional)
- Success criteria (critical vs important vs nice-to-have)
- Debugging guide for common issues
- Test report template

**Key Features**:
- Detailed step-by-step instructions for each participant
- Clap test for latency measurement
- Simultaneous speaking test for echo detection
- Console debugging instructions
- chrome://webrtc-internals inspection guide

#### 2. Pre-Validation Test Suite

**File**: `run-pre-validation.sh` (119 lines)

**Purpose**: Validate system readiness before manual testing

**Tests Executed**:
1. test-webrtc.mjs (Basic WebRTC, 2 peers)
2. test-audio-graph.mjs (Web Audio foundation)
3. test-gain-controls.mjs (Per-participant gain controls)
4. test-program-bus.mjs (Program bus mixing)
5. test-mix-minus.mjs (Mix-minus calculation, 3 peers)
6. test-return-feed.mjs (Return feed routing, 2 peers)

**Features**:
- Pass/fail tracking with exit code
- 60-second timeout per test
- Clear success/failure messaging
- Debugging guidance on failure
- Infrastructure verification steps

### Critical Bug Fix: WebRTC Renegotiation Race Condition

#### Problem Discovered

During pre-validation, discovered that return feeds only worked in one direction:
- Peer B successfully sends return feed to Peer A ✅
- Peer A **cannot** send return feed to Peer B ❌
- A's connection gets stuck in "connecting" state
- Perfect Negotiation collision during simultaneous renegotiation

**Root Cause**: We were manually creating offers in `addReturnFeedTrack()` which bypassed the Perfect Negotiation pattern's collision detection.

#### Solution Research

Used WebSearch to find MDN and Mozilla documentation on Perfect Negotiation pattern:

**Key Findings**:
- The `negotiationneeded` event is the correct way to handle renegotiation
- Event only fires when `signalingState` is "stable" (prevents race conditions)
- Must use `setLocalDescription()` **without arguments** for Perfect Negotiation
- This automatically creates the correct offer/answer based on current state
- Manual m-line ordering can cause "m-lines in subsequent offer doesn't match" error

**Sources**:
- MDN: "Establishing a connection: The WebRTC perfect negotiation pattern"
- Mozilla Blog: "Perfect negotiation in WebRTC"
- Stack Overflow: Multiple discussions on renegotiation timing issues

#### Implementation

**web/js/rtc-manager.js** modifications:

```javascript
// ADDED: negotiationneeded event listener in createPeerConnection()
pc.addEventListener('negotiationneeded', async () => {
  console.log(`[RTC] Negotiation needed for ${remotePeerId}`);

  this.dispatchEvent(new CustomEvent('negotiation-needed', {
    detail: { remotePeerId }
  }));
});

// MODIFIED: createOffer() to use Perfect Negotiation pattern
async createOffer(remotePeerId) {
  const pc = this.peerConnections.get(remotePeerId);
  if (!pc) {
    throw new Error(`No peer connection found for ${remotePeerId}`);
  }

  console.log(`[RTC] Creating offer for ${remotePeerId}`);

  // Perfect Negotiation: setLocalDescription() without arguments
  // automatically creates and sets the appropriate description
  await pc.setLocalDescription();
  console.log(`[RTC] Local description set (offer) for ${remotePeerId}`);

  return pc.localDescription;
}

// SIMPLIFIED: addReturnFeedTrack() - just adds track, event handles rest
addReturnFeedTrack(remotePeerId, mixMinusStream) {
  const pc = this.peerConnections.get(remotePeerId);
  // ... validation ...

  // Add track to peer connection
  // This will trigger the 'negotiationneeded' event which handles creating and sending the offer
  pc.addTrack(returnFeedTrack, mixMinusStream);
  console.log(`[RTC] Return feed track added (negotiationneeded event will fire)`);
}
```

**web/js/connection-manager.js** modifications:

```javascript
// ADDED: negotiation-needed event handler in setupRTCListeners()
this.rtcManager.addEventListener('negotiation-needed', async (event) => {
  const { remotePeerId } = event.detail;
  const state = this.getConnectionState(remotePeerId);

  console.log(`[ConnectionManager] Negotiation needed for ${remotePeerId} (makingOffer: ${state.makingOffer}, status: ${state.status})`);

  // Don't handle if we're already making an offer (prevents duplicate offers)
  if (state.makingOffer) {
    console.log(`[ConnectionManager] Ignoring negotiation-needed for ${remotePeerId} - already making offer`);
    return;
  }

  // Set makingOffer flag (Perfect Negotiation pattern)
  this.setConnectionState(remotePeerId, { makingOffer: true });

  try {
    // Create and send offer
    const offer = await this.rtcManager.createOffer(remotePeerId);
    this.signalingClient.sendOffer(remotePeerId, offer);
    console.log(`[ConnectionManager] Negotiation offer sent to ${remotePeerId}`);
  } catch (error) {
    console.error(`[ConnectionManager] Failed to create negotiation offer for ${remotePeerId}:`, error);
  } finally {
    this.setConnectionState(remotePeerId, { makingOffer: false });
  }
});

// SIMPLIFIED: addReturnFeedTrack() - removed connection status check
addReturnFeedTrack(remotePeerId, mixMinusStream) {
  console.log(`[ConnectionManager] Adding return feed track to ${remotePeerId}`);

  try {
    // Perfect Negotiation: We can add tracks anytime, negotiationneeded event handles timing
    // The event only fires when signalingState is stable, preventing race conditions
    this.rtcManager.addReturnFeedTrack(remotePeerId, mixMinusStream);
    console.log(`[ConnectionManager] Return feed track added for ${remotePeerId} (renegotiation will happen automatically)`);
  } catch (error) {
    console.error(`[ConnectionManager] Failed to add return feed for ${remotePeerId}:`, error);
  }
}
```

**web/js/main.js** modifications:

```javascript
// ADDED: Pending return feeds tracking
this.pendingReturnFeeds = new Map(); // peerId -> true (return feeds waiting for connection)

// ADDED: Staggered delays to avoid renegotiation collisions
const connectionState = this.connectionManager.getConnectionState(remotePeerId);
const isPolite = connectionState?.isPolite || false;
const delay = isPolite ? 500 : 2500; // Polite first, impolite waits

// ADDED: trySendPendingReturnFeed() method
async trySendPendingReturnFeed(remotePeerId) {
  if (!this.pendingReturnFeeds.has(remotePeerId)) {
    return;
  }

  const mixMinusStream = this.audioGraph.getMixMinusStream(remotePeerId);
  if (!mixMinusStream) {
    console.error(`[App] No mix-minus stream available for ${remotePeerId}, cannot send return feed`);
    this.pendingReturnFeeds.delete(remotePeerId);
    return;
  }

  this.pendingReturnFeeds.delete(remotePeerId);
  console.log(`[App] Adding return feed track for ${remotePeerId}`);

  try {
    this.connectionManager.addReturnFeedTrack(remotePeerId, mixMinusStream);
    console.log(`[App] Return feed track added for ${remotePeerId}`);
  } catch (error) {
    console.error(`[App] Failed to add return feed for ${remotePeerId}:`, error);
  }
}

// ADDED: Cleanup in handleEndSession()
this.pendingReturnFeeds.clear();

// ADDED: Cleanup in peer-left handler
this.pendingReturnFeeds.delete(peerId);
```

### Test Results

**Pre-Validation Suite**: ✅ **6/6 tests passing (100%)**

```
✅ WebRTC Connection          - Basic 2-peer connection working
✅ Audio Graph Foundation     - AudioContext and routing working
✅ Gain Controls              - UI controls and smooth ramping working
✅ Program Bus Mixing         - Unified stereo mix working
✅ Mix-Minus Calculation      - 3-peer phase-inversion working
✅ Return Feed Routing        - 2-peer return feeds working
```

### Key Technical Insight

**Perfect Negotiation Pattern** for renegotiation:

1. **Don't create offers manually** - let `negotiationneeded` event handle it
2. **Use `setLocalDescription()` without arguments** - auto-creates correct offer
3. **Event only fires when signalingState is "stable"** - prevents race conditions
4. **Guard against duplicate offers** - check `makingOffer` flag before handling event

This approach eliminates the race condition where both peers try to renegotiate simultaneously.

---

## Task Status

**Phase 1 (Pre-Validation): COMPLETE** ✅
- Test protocol documented
- Pre-validation automation created
- Critical bugs fixed
- All automated tests passing

**Phase 2 (Manual Testing): PENDING** ⏸️
- Requires 6 participants with headphones
- 45-60 minute testing session
- Follow protocol in `docs/testing/mix-minus-test-protocol.md`
- Document results in test report

Task 016 will be fully complete after successful manual testing session.

Please review changes. Reply with "approved" or "document it" to proceed with memory bank updates.
