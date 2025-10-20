# Mix-Minus Test Protocol

## Overview

**Objective**: Validate that OpenStudio's mix-minus system correctly prevents self-echo for all participants in a multi-person session.

**Test Type**: Manual integration testing with real participants
**Minimum Participants**: 6 (recommended: 3 hosts + 3 callers)
**Estimated Duration**: 45-60 minutes
**Success Criteria**: Zero instances of self-echo, clear audio quality, stable 10+ minute session

## Prerequisites

### Technical Requirements

**For Each Participant:**
- Chrome browser (version 90+)
- Headphones or earbuds (REQUIRED - prevents acoustic feedback)
- Working microphone
- Stable internet connection (minimum 1 Mbps up/down)
- Quiet testing environment

**Infrastructure:**
- OpenStudio server running and accessible
- Signaling server operational (port 3000)
- STUN/TURN servers configured (coturn running)
- Web client accessible via HTTP (port 8086)

### Pre-Test Validation

**Before gathering participants, verify:**

```bash
# 1. Check signaling server
curl http://localhost:3000/health
# Expected: {"status":"ok","uptime":N}

# 2. Check station API
curl http://localhost:3000/api/station
# Expected: JSON with station config

# 3. Verify web server
curl http://localhost:8086
# Expected: HTML page

# 4. Run automated test suite
timeout 60 node test-return-feed.mjs
# Expected: All tests passing
```

## Test Setup

### Participant Roles

**Host 1 (Primary):**
- Creates the room
- Leads the test procedure
- Monitors console for errors
- Takes notes on issues

**Host 2 & 3:**
- Join as secondary hosts
- Validate audio from host perspective
- Test simultaneous speaking

**Caller 1, 2, 3:**
- Join as callers
- Validate audio from caller perspective
- Test join/leave edge cases

### Environment Setup

1. **All participants:**
   - Close unnecessary browser tabs/apps
   - Use wired internet if possible (more stable than WiFi)
   - Wear headphones (prevent acoustic feedback)
   - Open Chrome DevTools (F12) → Console tab
   - Keep chrome://webrtc-internals open in separate tab

2. **Host 1 creates room:**
   - Navigate to http://localhost:8086 (or server URL)
   - Click "Start Session"
   - Share room URL (with #room-id) to all participants

3. **All others join:**
   - Navigate to shared URL with room ID
   - Click "Start Session"
   - Grant microphone permissions

### Expected Console Output

**Each participant should see:**
```
[SignalingClient] Connected to signaling server
[SignalingClient] Registered as peer: <peer-id>
[App] Room joined: <room-id>
[RTC] Creating peer connection for: <remote-peer-id>
[App] First stream from <remote-peer-id> = microphone
[App] Mix-minus stream created for <remote-peer-id>
[App] Second stream from <remote-peer-id> = return feed
[ReturnFeed] Starting return feed playback for <remote-peer-id>
```

**Console errors indicate problems - note them immediately**

## Test Procedure

### Phase 1: Basic Connectivity (5 minutes)

**Objective**: Verify all participants connected and receiving audio

1. **Host 1 announces:**
   - "This is Host 1, can everyone hear me?"
   - Wait for verbal confirmation from all 5 others

2. **Each participant speaks in order:**
   - Host 2: "This is Host 2, I hear Host 1"
   - Host 3: "This is Host 3, I hear Hosts 1 and 2"
   - Caller 1: "This is Caller 1, I hear all hosts"
   - Caller 2: "This is Caller 2, I hear everyone so far"
   - Caller 3: "This is Caller 3, I hear all 5 others"

3. **Host 1 confirms:**
   - "Everyone is connected, proceeding to echo test"

**Success Criteria:**
- All 6 participants heard by all others
- No distortion or dropouts
- No connection failures

**If failures occur:**
- Check console for WebRTC errors
- Check chrome://webrtc-internals for connection state
- Verify firewall/network settings
- Restart individual participants if needed

### Phase 2: Self-Echo Validation (10 minutes)

**Objective**: Confirm NOBODY hears their own voice

**Test A: Individual Confirmation**

Each participant performs this test:

1. **Speak continuously for 10 seconds:**
   - "Testing one two three, this is [name] speaking, testing audio echo, can I hear myself, testing testing testing"

2. **While speaking, listen carefully:**
   - Do you hear your own voice with delay?
   - Do you hear any echo or feedback?
   - Is the audio clear from others?

3. **Report result:**
   - "I do NOT hear myself" (expected)
   - OR "I HEAR myself with echo" (FAIL - critical bug)

**Expected Result:** All 6 participants report "I do NOT hear myself"

**Test B: Clap Test (Latency Measurement)**

1. **Host 1 announces:**
   - "I'm going to clap once, everyone count the delay"

2. **Host 1 claps once (sharp, loud)**

3. **All participants note:**
   - Time from clap to hearing it (estimate in milliseconds)
   - Any echo after the clap

4. **Repeat for 2-3 other participants**

**Expected Result:**
- Latency: <200ms glass-to-glass (acceptable)
- No echo following the clap
- Single sharp sound (not multiple reflections)

**Test C: Simultaneous Speaking**

1. **Host 1 announces:**
   - "Everyone count to 5 together, starting now"

2. **All 6 speak simultaneously:**
   - "One, two, three, four, five"

3. **Each participant confirms:**
   - Did you hear yourself? (should be NO)
   - Was the audio overwhelming/distorted?
   - Could you distinguish other voices?

**Expected Result:**
- No self-echo even during simultaneous speech
- Audio mix may be loud but not distorted
- Participants can distinguish multiple voices

### Phase 3: Audio Quality Assessment (5 minutes)

**Objective**: Verify audio is clear and professional quality

**Test A: Dynamic Range**

1. **Participant speaks at different volumes:**
   - Whisper: "Testing whisper volume"
   - Normal: "Testing normal speaking volume"
   - Loud: "TESTING LOUD VOLUME"

2. **Others confirm:**
   - All levels audible?
   - Any clipping or distortion at loud volume?
   - Any noise gate cutting off whispers?

**Expected Result:**
- All volume levels audible
- No clipping (volume meter <90%)
- No artificial cutoffs

**Test B: Background Noise**

1. **One participant makes noise:**
   - Rustle paper near microphone
   - Type on keyboard
   - Shuffle around

2. **Others confirm:**
   - Background noise audible?
   - Is it disruptive?
   - Any noise reduction artifacts?

**Expected Result:**
- Background noise transmitted (no aggressive noise gate)
- Not excessively amplified
- No "underwater" sound from processing

### Phase 4: Stability Test (10 minutes)

**Objective**: Verify system remains stable during normal conversation

1. **Host 1 announces:**
   - "We'll now have a 10-minute conversation. Speak naturally."

2. **Suggested conversation topics:**
   - What brought you to OpenStudio?
   - Experience with other virtual studio software?
   - Features you'd like to see added?
   - Audio quality compared to other platforms?

3. **During conversation, monitor:**
   - Console for errors
   - chrome://webrtc-internals for connection drops
   - Volume meter for consistent levels
   - Any degradation over time

**Expected Result:**
- No connection drops or reconnections
- No audio degradation over time
- No memory leaks (check Task Manager)
- CPU usage stable (<30% per Chrome tab)

### Phase 5: Join/Leave Edge Cases (10 minutes)

**Objective**: Verify mix-minus updates correctly when participants join/leave

**Test A: Mid-Session Join**

1. **Caller 3 leaves:**
   - Click "End Session" or close tab

2. **Remaining 5 confirm:**
   - Caller 3 no longer heard
   - Audio from others still clear
   - No errors in console

3. **Caller 3 rejoins:**
   - Navigate back to room URL
   - Click "Start Session"

4. **All 6 confirm:**
   - Caller 3 heard by all
   - All heard by Caller 3
   - Caller 3 does NOT hear themselves
   - No errors during rejoin

**Expected Result:**
- Clean leave (no audio artifacts)
- Clean rejoin (mix-minus working immediately)
- No disruption to other participants

**Test B: Multiple Simultaneous Leaves**

1. **All 3 callers leave simultaneously:**
   - All click "End Session" at same time

2. **3 hosts confirm:**
   - All callers removed cleanly
   - Audio between hosts still working
   - Mix-minus still working for hosts

3. **All 3 callers rejoin:**
   - Navigate back to room URL
   - Click "Start Session"

**Expected Result:**
- No errors or connection issues
- All mix-minus buses recreated correctly
- System recovers gracefully

### Phase 6: Stress Test (Optional, 5 minutes)

**Objective**: Test system limits

**Test A: High Audio Levels**

1. **All participants speak loudly simultaneously:**
   - Shout, clap, make noise

2. **Monitor volume meter:**
   - Does it hit red (>90%)?
   - Any clipping or distortion?

**Expected Result:**
- Volume meter may go red (expected)
- Some distortion acceptable at extreme levels
- No crashes or errors

**Test B: Rapid Mute/Unmute**

1. **Each participant rapidly clicks mute/unmute:**
   - 5-10 times in quick succession

2. **Others confirm:**
   - Hear participant muting/unmuting?
   - Any audio clicks or pops?
   - Any errors?

**Expected Result:**
- Mute/unmute works reliably
- No audio artifacts (smooth transitions)
- No errors in console

## Success Criteria

### Critical (MUST PASS)

✅ **Zero instances of self-echo** across all participants
✅ **All participants hear all others** (proper audio routing)
✅ **10+ minute session stability** (no crashes or disconnects)
✅ **Clean join/leave** (mix-minus updates correctly)

### Important (SHOULD PASS)

✅ **Latency <200ms glass-to-glass** (acceptable for conversation)
✅ **Clear audio quality** (no dropouts, distortion at normal levels)
✅ **CPU usage <30%** per tab (efficient Web Audio graph)
✅ **Console clean** (no errors or warnings)

### Nice-to-Have (MAY PASS)

✅ **Handles simultaneous speech** without distortion
✅ **Handles extreme audio levels** without clipping
✅ **Rapid mute/unmute** without artifacts

## Debugging Guide

### Issue: Participant Hears Themselves (Echo)

**Symptoms:**
- Participant reports hearing their own voice with delay
- Echo may be quiet or loud depending on gain settings

**Diagnostic Steps:**

1. **Check console for errors:**
   ```
   [App] Mix-minus stream created for <peer-id>
   ```
   - If missing: Mix-minus bus not created (bug in audio-graph.js)

2. **Check chrome://webrtc-internals:**
   - Navigate to peer connection
   - Check "Stats graphs for RTCPeerConnection"
   - Look for "ssrc_*_recv" tracks
   - Should see 2 tracks per remote peer (mic + return feed)

3. **Check window.audioGraph.getGraphInfo() in console:**
   ```javascript
   audioGraph.getGraphInfo()
   ```
   - Check mixMinus.count matches number of other participants
   - Check mixMinus.buses array has correct peer IDs
   - Verify excludedPeerId matches own peer ID

4. **Check window.returnFeedManager.getInfo():**
   ```javascript
   returnFeedManager.getInfo()
   ```
   - Verify count matches number of return feeds expected
   - Check feeds array for hasStream: true

**Possible Causes:**
- Mix-minus bus not created (check audio-graph.js addParticipant)
- Return feed not sent (check connection-manager.js addReturnFeedTrack)
- Return feed routed to audio graph instead of direct playback
- Stream order tracking incorrect (first/second stream detection)

**Immediate Fix:**
- Refresh browser (reconnect)
- If persists: Critical bug, stop testing and debug

### Issue: Audio Dropouts or Distortion

**Symptoms:**
- Intermittent audio loss
- Robotic/garbled audio
- Stuttering or crackling

**Diagnostic Steps:**

1. **Check chrome://webrtc-internals:**
   - Look for "packetsLost" metric
   - Check "bytesReceived" graph (should be smooth)
   - Check "jitter" (should be <30ms)

2. **Check network:**
   - Run speed test (fast.com)
   - Ping server (should be <50ms)
   - Check WiFi signal strength

3. **Check CPU usage:**
   - Open Task Manager
   - Check Chrome CPU % (should be <30% per tab)
   - Close other applications if high

**Possible Causes:**
- Network congestion (weak WiFi, bandwidth sharing)
- CPU overload (too many tabs, background apps)
- Audio buffer underruns (check AudioContext state)

**Immediate Fix:**
- Use wired connection instead of WiFi
- Close other browser tabs
- Reduce participant count for testing
- Check DynamicsCompressor settings (may be too aggressive)

### Issue: Participant Not Heard by Others

**Symptoms:**
- One participant speaks, others hear nothing
- No audio in/out for specific participant

**Diagnostic Steps:**

1. **Check microphone permissions:**
   - Browser should show mic icon in address bar
   - Click icon, verify "Allow" for microphone

2. **Check console for getUserMedia errors:**
   ```
   [RTC] Failed to get user media: NotAllowedError
   ```

3. **Check chrome://webrtc-internals:**
   - Look for RTCPeerConnection to this participant
   - Check "ssrc_*_send" tracks (should have audio track)
   - Check "bytesSent" graph (should be increasing)

4. **Check audio input device:**
   - Open Chrome settings (chrome://settings/content/microphone)
   - Verify correct device selected
   - Test microphone in system settings

**Possible Causes:**
- Microphone permissions denied
- Wrong input device selected
- Microphone muted at system level
- WebRTC connection failed to establish

**Immediate Fix:**
- Grant microphone permissions
- Select correct input device
- Check system audio settings
- Reconnect participant

### Issue: High Latency (>200ms)

**Symptoms:**
- Noticeable delay between speaking and hearing
- Conversation feels sluggish

**Diagnostic Steps:**

1. **Measure network latency:**
   ```bash
   ping <server-ip>
   ```
   - Should be <50ms
   - >100ms indicates network issue

2. **Check chrome://webrtc-internals:**
   - Look for "googCurrentDelayMs" metric
   - Check "googJitterBufferMs" (should be <50ms)

3. **Check AudioContext latency:**
   ```javascript
   audioContextManager.getState()
   ```
   - baseLatency should be low (<0.01s)
   - If high, may be system audio driver issue

**Possible Causes:**
- Geographic distance (server far from participants)
- Network routing issues (poor ISP peering)
- Audio buffer settings (system audio drivers)
- TURN relay in use (adds latency vs direct peer-to-peer)

**Immediate Fix:**
- Move participants closer to server geographically
- Use wired connection (reduces jitter)
- Check if TURN relay is being used (should avoid if possible)
- May be unavoidable depending on network topology

## Test Report Template

After completing testing, document results:

```markdown
# Mix-Minus Test Session Report

**Date**: YYYY-MM-DD
**Duration**: X minutes
**Participants**: 6 (3 hosts, 3 callers)
**OpenStudio Version**: Release 0.1 (Task 015 complete)

## Configuration

- **Browser**: Chrome XX.X.X
- **Server**: http://localhost:8086
- **Signaling**: ws://localhost:3000
- **TURN**: coturn (localhost:3478)

## Test Results

### Phase 1: Basic Connectivity ✅/❌
- All participants connected: YES/NO
- Audio heard by all: YES/NO
- Issues: [describe any problems]

### Phase 2: Self-Echo Validation ✅/❌
- Participant 1 (Host 1): NO ECHO / ECHO DETECTED
- Participant 2 (Host 2): NO ECHO / ECHO DETECTED
- Participant 3 (Host 3): NO ECHO / ECHO DETECTED
- Participant 4 (Caller 1): NO ECHO / ECHO DETECTED
- Participant 5 (Caller 2): NO ECHO / ECHO DETECTED
- Participant 6 (Caller 3): NO ECHO / ECHO DETECTED
- Clap test latency: ~XXXms
- Issues: [describe any problems]

### Phase 3: Audio Quality ✅/❌
- Dynamic range (whisper to loud): GOOD / ISSUES
- Background noise handling: ACCEPTABLE / ISSUES
- Overall quality rating: EXCELLENT / GOOD / FAIR / POOR
- Issues: [describe any problems]

### Phase 4: Stability Test ✅/❌
- 10-minute session completed: YES / NO
- Connection drops: 0 / X
- Audio degradation: NONE / MINOR / MAJOR
- CPU usage: XX%
- Issues: [describe any problems]

### Phase 5: Join/Leave Edge Cases ✅/❌
- Mid-session join: CLEAN / ISSUES
- Mid-session leave: CLEAN / ISSUES
- Multiple simultaneous leaves: CLEAN / ISSUES
- Issues: [describe any problems]

### Phase 6: Stress Test ✅/❌
- High audio levels: HANDLED / CLIPPED
- Rapid mute/unmute: SMOOTH / ISSUES
- Issues: [describe any problems]

## Overall Assessment

**PASS** / **FAIL** (with issues) / **FAIL** (critical bugs)

**Critical Issues**: [list any blocking bugs]
**Minor Issues**: [list any non-blocking problems]
**Observations**: [general notes, suggestions]

## Next Steps

- [ ] Fix critical issues (if any)
- [ ] Address minor issues (if time permits)
- [ ] Proceed to Task 017 (if passed)
- [ ] Document lessons learned
```

## Notes

- **Headphones are mandatory** - Without headphones, acoustic feedback will occur (microphone picks up speakers), which is NOT a mix-minus bug
- **Chrome is primary target** - Firefox and Safari may work but have not been tested extensively
- **Local network recommended** - Testing over Internet adds latency and network variability
- **Expect some issues** - This is first comprehensive multi-participant test; bugs are expected and should be documented
- **Be patient** - WebRTC connections can take 5-10 seconds to establish initially

## Success Means

If this test passes with zero self-echo instances and stable 10+ minute sessions:

**OpenStudio has validated its core promise: Professional-quality virtual studio with mix-minus anti-echo system**

This is the most critical test in Release 0.1. Everything else is polish.
