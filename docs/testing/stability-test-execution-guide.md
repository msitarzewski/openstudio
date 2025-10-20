# Stability Test Execution Guide - OpenStudio Release 0.1

This guide provides step-by-step instructions for conducting the 60-minute stability test with 6 participants.

---

## Prerequisites

### Infrastructure
- [ ] Signaling server running (port 3000)
- [ ] Icecast server running (port 8000)
- [ ] coturn server running (port 3478)
- [ ] Web client accessible (http://localhost:8086 or deployed URL)

**Verification**:
```bash
# Check signaling server
curl http://localhost:3000/health

# Check Icecast
curl http://localhost:8000

# Check coturn
sudo netstat -tulpn | grep 3478

# Check web client
curl http://localhost:8086
```

### Participants
- [ ] 6 participants recruited (3 hosts + 3 callers)
- [ ] Each has working microphone and headphones
- [ ] Each on different network (not all localhost)
- [ ] Mix of wired and WiFi connections
- [ ] Diverse hardware (at least one low-end device)

### Participant Hardware Requirements
**Minimum**:
- CPU: Dual-core 2.0 GHz
- RAM: 4GB
- Browser: Chrome 90+, Firefox 88+, or Safari 14+
- Microphone: Built-in or USB
- Headphones: Required (prevent echo/feedback)

### Monitoring Tools
- [ ] Chrome DevTools (F12) on at least 2 machines
- [ ] System monitor (Task Manager/Activity Monitor/htop) running
- [ ] Stopwatch or timer for latency measurements
- [ ] Screen recording tool (optional, for evidence)

### Test Documents
- [ ] `stability-test-report.md` template ready
- [ ] `performance-benchmarks.md` template ready
- [ ] Spreadsheet or notepad for real-time notes

---

## Pre-Test Setup (15 minutes before test)

### 1. Infrastructure Verification

```bash
# Start all services
cd /home/michael/Documents/openstudio
sudo docker compose up -d

# Verify all running
sudo docker compose ps

# Check logs
sudo docker compose logs -f --tail=20
```

### 2. Test Coordination

**Assign roles**:
- **Test Coordinator**: Primary observer, takes notes
- **Host 1**: Creates room, starts streaming
- **Host 2**: Joins as host
- **Host 3**: Joins as host
- **Caller 1**: Joins as caller
- **Caller 2**: Joins as caller
- **Caller 3**: Joins as caller

**Communication channel**: Set up backup chat (Discord/Slack/etc) for coordination

### 3. Participant Briefing (10 minutes)

Share with all participants:

**Instructions**:
1. Open browser (Chrome recommended)
2. Navigate to: [web client URL]
3. Allow microphone access when prompted
4. Plug in headphones (REQUIRED - prevent feedback)
5. Wait for coordinator's signal before joining

**Test scenario**:
- Simulate a live show/podcast recording
- Natural conversation, take turns speaking
- Respond to coordinator's cues for specific tests
- Report any issues immediately in backup chat

**Duration**: 60 minutes (set alarms/timers)

---

## Test Execution

### Phase 1: Session Initialization (Minutes 0-5)

#### Step 1: Host 1 Creates Room

**Host 1**:
1. Open web client: http://localhost:8086 (or deployed URL)
2. Click "Start Session"
3. Allow microphone access
4. Wait for room creation
5. Copy room URL from address bar (contains #room-uuid)
6. Share room URL in backup chat

**Coordinator**:
- Record start time: [HH:MM:SS]
- Verify Host 1 shows "Connected" status
- Note room ID for test report

#### Step 2: Participants Join

**All other participants** (join in order):
1. Host 2: Open room URL, click "Start Session"
2. Host 3: Open room URL, click "Start Session"
3. Caller 1: Open room URL, click "Start Session"
4. Caller 2: Open room URL, click "Start Session"
5. Caller 3: Open room URL, click "Start Session"

**Coordinator**:
- Record join time for each participant
- Verify all 6 participant cards visible on each screen
- Check connection status (all should show "Connected")
- **CHECKPOINT**: All participants can hear each other

#### Step 3: Start Icecast Streaming

**Host 1 only**:
1. Select bitrate: 128 kbps (recommended)
2. Click "Start Streaming"
3. Wait for "Streaming to Icecast" status (green)

**Coordinator**:
- Record streaming start time: [HH:MM:SS]
- Verify stream URL: http://localhost:8000/live.opus
- Open stream in VLC to verify audio

---

### Phase 2: Baseline Measurements (Minutes 5-10)

#### Performance Monitoring Setup

**Host 1 and Caller 1** (representative samples):
1. Open Chrome DevTools (F12)
2. Go to Performance tab
3. Open system monitor (Task Manager/Activity Monitor)

**Coordinator**:
Record baseline metrics:

| Participant | CPU % | Memory (MB) | Notes |
|-------------|-------|-------------|-------|
| Host 1      |       |             | Streaming |
| Caller 1    |       |             | Not streaming |

#### Initial Audio Quality Check

**All participants**:
1. Each person says their name clearly
2. Others confirm they hear it clearly
3. Report any issues (echo, distortion, dropouts)

**Coordinator**:
- Verify no self-echo (mix-minus working)
- Verify volume levels consistent
- Note any quality issues

---

### Phase 3: Mute Latency Testing (Minutes 10-15)

**Test procedure** (repeat 10 times):

1. **Coordinator announces**: "Test [N]: [Initiator] will mute [Target]"
2. **Initiator**: Click mute button for target participant, start timer
3. **Target**: When you can no longer hear yourself, say "MUTED"
4. **Initiator**: Stop timer, record latency
5. **Initiator**: Unmute target
6. **Wait 10 seconds** before next test

**Test Matrix** (example):

| Test # | Initiator | Target | Expected Latency |
|--------|-----------|--------|------------------|
| 1      | Host 1    | Caller 1 | <150ms |
| 2      | Host 1    | Caller 2 | <150ms |
| 3      | Host 2    | Caller 3 | <150ms |
| 4      | Host 2    | Host 1   | <150ms |
| 5      | Host 3    | Host 2   | <150ms |
| 6      | Host 1    | Host 3   | <150ms |
| 7      | Host 2    | Caller 1 | <150ms |
| 8      | Host 3    | Caller 2 | <150ms |
| 9      | Host 1    | Caller 3 | <150ms |
| 10     | Host 3    | Caller 1 | <150ms |

**Coordinator**:
- Record each latency measurement
- Calculate average
- Note any outliers or failures

---

### Phase 4: Normal Operation (Minutes 15-50)

**Activity**: Simulate natural conversation

**Conversation topics** (rotate every 5-10 minutes):
1. Recent news/events
2. Hobbies and interests
3. Technology discussion
4. Travel experiences
5. Favorite media (books/movies/music)
6. Future plans/goals

**Guidelines**:
- Take turns speaking (avoid everyone talking at once)
- Vary speaking patterns (short responses, long monologues)
- Occasional silence is OK (tests idle behavior)
- Use gain controls occasionally (adjust volume)
- Hosts can mute/unmute participants occasionally

**Monitoring** (every 5 minutes):

**Host 1 and Caller 1**:
- Check CPU usage (should be stable)
- Check memory usage (should not grow significantly)
- Note current values in spreadsheet

**Coordinator**:
- Monitor backup chat for any reported issues
- Observe stream in VLC (quality, dropouts)
- Record time-stamped notes for any anomalies

**Observation checklist** (continuous):
- [ ] Audio quality remains consistent
- [ ] No dropouts or glitches
- [ ] Volume meter working correctly
- [ ] Participant cards remain accurate
- [ ] CPU/memory stable
- [ ] Icecast stream continuous

---

### Phase 5: Stress Testing (Minutes 50-55)

**Intentional stress scenarios**:

#### Test 1: All Talk Simultaneously (1 minute)
- Everyone speaks at the same time for 1 minute
- Observe CPU spike, audio quality
- Record peak CPU/memory

#### Test 2: Rapid Gain Adjustments (30 seconds)
- Host 1: Rapidly adjust gain sliders for all participants
- Observe audio smoothness, UI responsiveness

#### Test 3: Rapid Mute/Unmute (30 seconds)
- Host 1: Rapidly mute and unmute different participants
- Observe latency consistency, UI responsiveness

#### Test 4: Background Load (2 minutes)
- **Host 1 and Caller 1**: Open 5-10 heavy browser tabs
- Continue conversation
- Observe performance degradation

**Coordinator**:
- Record peak CPU/memory during stress tests
- Note any audio artifacts or dropouts
- Observe if system recovers after stress

---

### Phase 6: Graceful Shutdown (Minutes 55-60)

#### Icecast Stream Stop

**Host 1**:
1. Click "Stop Streaming"
2. Verify status changes to "Not Streaming"

**Coordinator**:
- Record stream stop time: [HH:MM:SS]
- Verify VLC stream ends cleanly

#### Participant Departure (Test 1: One-by-one)

**Departure order**:
1. Caller 3 leaves (click "End Session")
2. Caller 2 leaves
3. Caller 1 leaves
4. Host 3 leaves
5. Host 2 leaves
6. Host 1 leaves (ends session)

**Coordinator**:
- Verify participant cards update correctly
- Verify audio graph adapts (no errors)
- Verify clean session termination

#### Test 2: Simultaneous Departure (Optional)

If time permits, run a second 5-minute session where all participants leave at once:
- All click "End Session" simultaneously
- Observe server logs for errors
- Verify clean shutdown

---

## Post-Test Procedures (30 minutes after test)

### 1. Collect Performance Data

**From Host 1 and Caller 1**:
- Export Chrome DevTools Performance recording (if captured)
- Screenshot final CPU/memory stats
- Copy browser console logs (check for errors)

### 2. Participant Debrief (10 minutes)

**Survey each participant**:

1. Audio quality (1-5): ___
2. Clarity of other participants (1-5): ___
3. Echo or feedback heard (Yes/No): ___
4. Dropouts experienced (count): ___
5. Overall experience (1-5): ___
6. Issues encountered: ___
7. Would you use this for real? (Yes/No): ___

### 3. Fill Out Test Reports

**Complete**:
1. `stability-test-report.md`
   - Fill all sections with collected data
   - Mark acceptance criteria as PASS/FAIL
   - Document any issues discovered

2. `performance-benchmarks.md`
   - Enter CPU/memory measurements
   - Calculate averages and peaks
   - Analyze trends and bottlenecks

### 4. Server Log Review

```bash
# Check for errors
sudo docker compose logs signaling-server | grep -i error

# Check for warnings
sudo docker compose logs icecast | grep -i warn

# Export logs for analysis
sudo docker compose logs > /tmp/openstudio-test-logs.txt
```

### 5. Issue Documentation

For any issues found, create detailed bug reports:

**Bug Report Template**:
```markdown
## Issue: [Short description]

**Severity**: [Critical / Major / Minor]
**Frequency**: [Always / Sometimes / Rare]
**Affected Component**: [signaling-server / web-client / icecast / etc]

**Steps to Reproduce**:
1. [Step 1]
2. [Step 2]
3. [Observed behavior]

**Expected Behavior**: [What should happen]

**Actual Behavior**: [What actually happened]

**Environment**:
- Browser: [version]
- OS: [version]
- Hardware: [specs]
- Network: [type]

**Logs/Screenshots**: [Attach evidence]

**Impact**: [How this affects users]

**Suggested Fix**: [If known]
```

---

## Troubleshooting Common Issues

### Issue: Participant Cannot Join Room

**Symptoms**: Room URL doesn't work, stuck on "Connecting..."

**Checks**:
- Verify room ID is correct (matches host's URL)
- Check signaling server is running (curl http://localhost:3000/health)
- Check browser console for errors
- Try refreshing page

**Fix**:
- Host may need to create new room
- Check firewall/network connectivity

---

### Issue: No Audio from Participant

**Symptoms**: Participant card shows connected, but no audio

**Checks**:
- Verify microphone permission granted
- Check microphone is selected in browser settings
- Verify participant is not muted
- Check volume meter (should show activity when speaking)

**Fix**:
- Participant: Click "End Session", rejoin
- Check system audio settings
- Try different browser

---

### Issue: Self-Echo Heard

**Symptoms**: Participant hears their own voice with delay

**Checks**:
- Verify mix-minus is working (check browser console: `audioGraph.getMixMinusManager()`)
- Verify return feeds are active
- Check if using headphones (speakers will cause feedback)

**Fix**:
- All participants MUST use headphones
- If still present, this is a critical bug (mix-minus failure)

---

### Issue: Icecast Stream Won't Start

**Symptoms**: "Failed to connect to Icecast" error

**Checks**:
- Verify Icecast running (curl http://localhost:8000)
- Check credentials match config (source/hackme for dev)
- Check browser console for errors

**Fix**:
```bash
# Restart Icecast
sudo docker compose restart icecast

# Check Icecast logs
sudo docker compose logs icecast
```

---

### Issue: High CPU Usage

**Symptoms**: >50% CPU, fan spinning, browser sluggish

**Checks**:
- How many participants? (CPU increases with peer count)
- Hardware specs? (may be below minimum requirements)
- Other browser tabs open? (close unnecessary tabs)
- Is streaming active? (adds ~5-10% CPU overhead)

**Investigation**:
- Open Chrome DevTools Performance tab
- Record 10 seconds
- Analyze which functions consume most CPU
- Document findings in performance report

---

### Issue: Memory Leak

**Symptoms**: Memory grows continuously over session

**Checks**:
- Record memory every 5 minutes
- Calculate growth rate (MB/hour)
- Check if memory is freed when participants leave

**Investigation**:
- Chrome DevTools Memory tab
- Take heap snapshots at 0, 30, 60 minutes
- Compare snapshots to identify retained objects
- Document findings in performance report

---

### Issue: WebRTC Connection Failures

**Symptoms**: Participant stuck in "connecting", peer cards show disconnected

**Checks**:
- Check NAT/firewall settings
- Verify TURN server accessible (port 3478)
- Check network type (symmetric NAT can cause issues)

**Fix**:
- Verify coturn is running
- Check TURN credentials in station manifest
- Try from different network

---

## Success Criteria Checklist

At the end of testing, verify all criteria are met:

### Stability
- [ ] 60-minute session completed without crashes
- [ ] Zero audio dropouts during stable network
- [ ] Zero WebRTC connection failures (stable conditions)
- [ ] Icecast stream maintained for full session

### Performance
- [ ] CPU usage averaged <30% on typical hardware
- [ ] Memory usage stayed <500MB for 6-participant session
- [ ] No significant memory leaks observed

### Latency
- [ ] Mute latency averaged <150ms (10 measurements)
- [ ] Glass-to-glass latency acceptable (<500ms)
- [ ] Icecast stream latency <5 seconds

### Quality
- [ ] Mix-minus eliminated self-echo
- [ ] Audio quality rated ≥4.0/5.0 by participants
- [ ] No audio artifacts (clicks, pops, distortion)
- [ ] Volume meter accurately reflected levels

### Release 0.1 Acceptance Criteria
- [ ] N hosts + Y callers stable for 60 min ✅
- [ ] Global mute/unmute <150ms latency ✅
- [ ] Mix-minus working (no self-echo for callers) ✅
- [ ] OGG/Opus stream playable via Icecast ✅
- [ ] Setup from clone < 5 min ✅

---

## Final Assessment

**If all criteria PASS**: Ready for Release 0.1 MVP 🎉

**If any critical failures**: Document issues, fix bugs, re-test

**If minor issues found**: Document for Release 0.2, proceed with MVP if non-blocking

---

## Appendix: Quick Reference Commands

### Start Infrastructure
```bash
cd /home/michael/Documents/openstudio
sudo docker compose up -d
```

### Check Service Status
```bash
sudo docker compose ps
curl http://localhost:3000/health
curl http://localhost:8000
sudo netstat -tulpn | grep 3478
```

### View Logs
```bash
sudo docker compose logs -f signaling-server
sudo docker compose logs -f icecast
sudo docker compose logs -f coturn
```

### Start Web Client
```bash
cd /home/michael/Documents/openstudio/web
python3 -m http.server 8086
```

### Monitor Browser Performance
```javascript
// Browser console commands
console.log(performance.memory.usedJSHeapSize / 1048576 + ' MB');
console.log(audioGraph.getGraphInfo());
console.log(audioContextManager.getState());
```

### Emergency Stop
```bash
# Stop all services
sudo docker compose down

# Kill hung browser
killall chrome
```
