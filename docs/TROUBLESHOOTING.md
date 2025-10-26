# OpenStudio Troubleshooting Guide

This guide helps you diagnose and resolve common issues with OpenStudio.

---

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Infrastructure Issues](#infrastructure-issues)
- [WebRTC Connection Problems](#webrtc-connection-problems)
- [Audio Issues](#audio-issues)
- [Streaming Problems](#streaming-problems)
- [Performance Issues](#performance-issues)
- [Browser Compatibility](#browser-compatibility)
- [Development Environment](#development-environment)
- [Getting Further Help](#getting-further-help)

---

## Quick Diagnostics

Before diving into specific issues, run these quick checks:

### 1. Verify Infrastructure Status

```bash
# Check if all Docker containers are running
docker compose ps

# Expected output:
# openstudio-signaling   running   0.0.0.0:6736->6736/tcp (healthy)
# openstudio-icecast     running   0.0.0.0:6737->8000/tcp (healthy)
# openstudio-coturn      running

# Check signaling server health
curl http://localhost:6736/health
# Expected: {"status":"ok","uptime":123}

# Check Icecast server
curl -I http://localhost:6737/
# Expected: HTTP/1.0 400 Bad Request (normal - needs proper request)

# Check web server (if running)
curl -I http://localhost:8086/
# Expected: HTTP/1.0 200 OK
```

### 2. Check Browser Console

Open browser DevTools (F12) and check the Console tab:

**Normal startup logs should show**:
```
[App] Peer ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
[Signaling] Connecting to ws://localhost:6736...
[Signaling] WebSocket connected
[Signaling] Received: {type: welcome, ...}
[Signaling] Received: {type: registered, ...}
```

**Look for errors like**:
- `WebSocket connection failed: ERR_CONNECTION_REFUSED` → Signaling server not running
- `Failed to fetch station config` → API endpoint not responding
- `AudioContext suspended` → Click "Start Session" to resume

### 3. Run Automated Tests

```bash
./run-pre-validation.sh

# Expected: 6 passed, 0 failed
# If tests fail, check output for specific error messages
```

---

## Infrastructure Issues

### Port Conflicts

**Symptom**: Error `EADDRINUSE: address already in use :::6736` or `:6737` or `:8086`

**Cause**: Another process is using the port

**Solution**:

```bash
# Find what's using the port (macOS/Linux)
lsof -i :6736  # or :6737, :8086

# Find what's using the port (Windows)
netstat -ano | findstr :6736

# If it's Docker signaling container:
docker compose stop signaling

# If it's a local dev server (Ctrl+C didn't work):
pkill -f "node.*server.js"

# If it's web server:
pkill -f "http.server 8086"

# Common port conflicts:
# 6736 - Was previously 3000 (React/Express/Next.js)
# 8086 - Web server, avoid 8000 (Django/Jupyter)
# 6737 - Icecast, was previously 8000
```

### Docker Services Not Starting

**Symptom**: `docker compose up` fails or containers exit immediately

**Diagnosis**:

```bash
# Check Docker status
docker compose ps

# View logs for specific service
docker compose logs signaling
docker compose logs icecast
docker compose logs coturn

# Check Docker disk space
docker system df
```

**Common Causes**:

1. **Insufficient disk space**:
   ```bash
   # Clean up Docker
   docker system prune -a
   ```

2. **Configuration errors**:
   ```bash
   # Validate docker-compose.yml
   docker compose config

   # Check station-manifest.json
   cd server && node -e "require('./lib/config-loader.js')"
   ```

3. **Port already bound**:
   ```bash
   # Stop all containers
   docker compose down

   # Check what's using ports
   lsof -i :6736 -i :6737 -i :3478

   # Restart with fresh state
   docker compose up -d
   ```

### Containers Unhealthy

**Symptom**: Docker compose shows containers as `(unhealthy)` or `(health: starting)`

**Diagnosis**:

```bash
# Check health check status
docker inspect openstudio-signaling | grep -A 10 Health

# For signaling server:
curl http://localhost:6736/health
# Should return within 5 seconds

# For Icecast:
curl http://localhost:6737/
# Should return HTTP response (even if 400)
```

**Solutions**:

```bash
# Give containers more time (Icecast needs ~10s to start)
sleep 15 && docker compose ps

# Restart unhealthy container
docker compose restart signaling

# Check for resource constraints
docker stats

# If containers keep failing, rebuild
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## WebRTC Connection Problems

### Peers Can't Connect

**Symptom**: "Start Session" clicked but peers don't see each other

**Diagnosis**:

Check browser console for:
```
[ConnectionManager] Connection failed for <peerId>
[RTC] ICE negotiation failed
[Signaling] Peer <peerId> not found
```

**Solutions**:

1. **Verify signaling server connection**:
   - Browser console should show `[Signaling] WebSocket connected`
   - If not, check signaling server is running: `docker compose ps`

2. **Check room creation**:
   ```javascript
   // Browser console:
   window.app.currentRoomId
   // Should return a UUID

   // URL should have hash with room ID:
   // http://localhost:8086/#abc12345-6789-...
   ```

3. **Test with same browser, different tabs**:
   - Open two tabs in the same browser
   - Create room in first tab
   - Copy URL with room ID (#abc123...) to second tab
   - Both should connect locally (eliminates network issues)

4. **Check STUN/TURN configuration**:
   ```bash
   # View station config
   curl http://localhost:6736/api/station | jq .ice

   # Should show:
   # {
   #   "stun": ["stun:localhost:3478"],
   #   "turn": ["turn:localhost:3478"]
   # }
   ```

### ICE Candidates Not Generated

**Symptom**: Browser console shows "No ICE candidates" or connection stuck in "connecting"

**Diagnosis**:

```bash
# Check coturn service
docker compose logs coturn | tail -20

# Test STUN server
# Install stun-client tool:
# macOS: brew install stuntman
# Linux: apt-get install stun-client

stun localhost 3478
# Should return your public IP
```

**Solutions**:

1. **Restart coturn**:
   ```bash
   docker compose restart coturn
   ```

2. **Check firewall**:
   - Ensure ports 3478 (STUN) and 49152-49200 (TURN relay) are not blocked

3. **Network Mode Issues** (if using Docker):
   - coturn uses `network_mode: host` for simplicity
   - If using VPN or complex network, try bridge mode

### Connection Drops After Working

**Symptom**: Peers connect successfully but disconnect after 30-60 seconds

**Diagnosis**:

Browser console will show:
```
[ConnectionManager] RTC connection state for <peerId>: disconnected
[ConnectionManager] Scheduling retry for <peerId>
```

**Solutions**:

1. **Network instability**:
   - Check for packet loss: `ping localhost` (should be 0% loss)
   - Disable VPN temporarily to test
   - Close bandwidth-intensive applications

2. **WebSocket ping/pong timeout**:
   - Signaling server sends ping every 30s
   - If client doesn't respond, connection drops
   - Check browser console for `[Signaling] WebSocket closed`

3. **Increase retry attempts** (temporary debugging):
   ```javascript
   // web/js/connection-manager.js
   // Change MAX_RETRY_ATTEMPTS from 3 to 5
   ```

---

## Audio Issues

### No Audio Heard

**Symptom**: Peers connected, but no audio

**Diagnosis**:

1. **Check browser console**:
   ```
   [AudioGraph] Participant count: 0  ← Should be > 0
   [App] Failed to add participant to audio graph
   [RTC] Remote track received  ← Should see this
   ```

2. **Check audio graph state**:
   ```javascript
   // Browser console:
   window.audioGraph.getGraphInfo()
   // Should show participants and nodes

   window.audioContextManager.getState()
   // Should be "running" (not "suspended")
   ```

**Solutions**:

1. **AudioContext suspended**:
   - Browser autoplay policy blocks audio until user interaction
   - Click "Start Session" button to resume AudioContext
   - Should see: `[AudioContext] State changed to: running`

2. **No microphone permission**:
   ```javascript
   // Browser console:
   navigator.mediaDevices.getUserMedia({ audio: true })
     .then(stream => console.log('Mic access OK:', stream.id))
     .catch(err => console.error('Mic denied:', err));
   ```
   - If denied, browser will show permission icon in address bar
   - Click and grant microphone permission

3. **Audio routing issue**:
   ```javascript
   // Check if participant was added to audio graph
   window.audioGraph.getGraphInfo().participantCount
   // Should match number of remote peers (not including self)
   ```

### Echo or Feedback

**Symptom**: Participants hear themselves with delay, creating echo/feedback

**Diagnosis**:

1. **Check mix-minus system**:
   ```javascript
   // Browser console:
   window.audioGraph.getMixMinusManager().getInfo()
   // Should show buses for each participant
   ```

2. **Check return feed playback**:
   ```javascript
   window.returnFeedManager.getInfo()
   // Should show return feeds for each participant
   ```

**Causes and Solutions**:

1. **Mix-minus not created**:
   - Mix-minus buses should auto-create when peer joins
   - Check: `[MixMinus] Creating mix-minus bus for <peerId>`
   - If not created, bug in audio-graph.js

2. **Return feed not sent**:
   - Return feeds should be sent 500ms (polite) or 2500ms (impolite) after peer joins
   - Check: `[App] Adding return feed track for <peerId>`
   - If "Connection not ready", wait for WebRTC connection to complete

3. **Speakers instead of headphones**:
   - Microphone picking up speaker output creates feedback loop
   - **Solution**: Use headphones or earbuds

4. **Multiple audio sources**:
   - Ensure only one browser tab is active per participant
   - Close duplicate tabs

### Audio Quality Issues

**Symptom**: Audio is choppy, garbled, or distorted

**Diagnosis**:

```javascript
// Browser console:
// Check CPU usage
window.performance.memory
// heapSizeLimit should not be close to usedJSHeapSize

// Check WebRTC stats
// In Chrome DevTools: chrome://webrtc-internals
// Look for "packetsLost", "jitter", "roundTripTime"
```

**Solutions**:

1. **High CPU usage**:
   - Close other applications
   - Reduce participant count
   - Check: `Activity Monitor` (macOS), `Task Manager` (Windows), `top` (Linux)

2. **Network congestion**:
   - Close bandwidth-intensive apps (streaming video, large downloads)
   - Check for WiFi interference
   - Use wired Ethernet if possible

3. **Browser limitations**:
   - Chrome recommended (best WebRTC support)
   - Update browser to latest version
   - Disable browser extensions temporarily

### Mute Not Working

**Symptom**: Clicking mute doesn't silence participant

**Diagnosis**:

```javascript
// Browser console (on host):
window.muteManager.getMuteState('<peerId>')
// Should show {muted: true, authority: 'producer', ...}

// Check gain value:
window.audioGraph.getGraphInfo().participants
// Find peerId, check gainValue (should be 0 when muted)
```

**Known Limitation**:

- **Self-mute doesn't work** (architectural constraint)
  - Participants don't route their own microphone through audio graph
  - Host mute works perfectly (routes remote peer through audio graph)
  - Workaround: Future enhancement will add microphone track muting

**Solutions**:

1. **Host mute**:
   - Host can mute any participant (producer authority)
   - Participant muted by host sees red "Muted (Host)" button
   - Audio graph gain set to 0 immediately

2. **Mute signaling not propagating**:
   - Check browser console for: `[Signaling] Sending: {type: mute, ...}`
   - All peers should receive mute message
   - If not propagating, check WebSocket connection

---

## Streaming Problems

### Icecast Stream Not Starting

**Symptom**: Click "Start Streaming" but stream doesn't start

**Diagnosis**:

```bash
# Check Icecast logs
docker compose logs icecast | tail -30

# Test Icecast manually
curl -u source:hackme -X PUT -H "Content-Type: audio/ogg" \
  http://localhost:6737/live.opus \
  --data-binary @/dev/null
# Should not return error immediately
```

**Solutions**:

1. **Icecast not running**:
   ```bash
   docker compose ps | grep icecast
   # Should show "running" and "healthy"

   docker compose restart icecast
   ```

2. **Credentials incorrect**:
   - Default: source/hackme (in docker-compose.yml)
   - Check `icecast-streamer.js` for hard-coded credentials
   - Should match `ICECAST_SOURCE_PASSWORD` in docker-compose.yml

3. **Browser console errors**:
   ```
   [IcecastStreamer] Failed to connect: NetworkError
   [StreamEncoder] MediaRecorder error
   ```
   - Check browser supports MediaRecorder with Opus
   - Try different browser (Chrome recommended)

### Stream Playback Issues

**Symptom**: Stream starts but listeners can't play it

**Diagnosis**:

```bash
# Check stream is available
curl http://localhost:6737/status-json.xsl | jq .

# Try playing stream locally
# macOS:
open http://localhost:6737/live.opus

# Linux:
vlc http://localhost:6737/live.opus

# Windows:
start http://localhost:6737/live.opus
```

**Solutions**:

1. **Stream not mounted**:
   - Icecast status should show `/live.opus` mount point
   - If not, stream didn't start successfully

2. **Codec not supported**:
   - OpenStudio uses Opus in WebM container
   - Most modern players support this
   - Try VLC if browser player fails

3. **Firewall blocking**:
   - If accessing remotely, ensure port 6737 is open
   - Check router port forwarding settings

### Stream Disconnects

**Symptom**: Stream starts but disconnects after some time

**Diagnosis**:

Browser console will show:
```
[IcecastStreamer] Upload failed: TypeError: Failed to fetch
[IcecastStreamer] Reconnecting in 5s... (attempt 1/10)
```

**Solutions**:

1. **Network issues**:
   - Check network stability
   - Disable VPN temporarily
   - Try wired connection instead of WiFi

2. **Icecast timeout**:
   - Increase timeout in icecast/entrypoint.sh
   - Restart Icecast: `docker compose restart icecast`

3. **Browser throttling**:
   - Browser may throttle background tabs
   - Keep streaming tab in foreground
   - Check browser task manager (Shift+Esc in Chrome)

---

## Performance Issues

### High CPU Usage

**Symptom**: Browser tab using > 30% CPU

**Diagnosis**:

```javascript
// Browser console:
// Check participant count
window.audioGraph.getGraphInfo().participantCount

// Check volume meter
window.volumeMeter.getInfo()
// stopAnimation() to temporarily disable meter
```

**Solutions**:

1. **Too many participants**:
   - Mesh network scales O(N²)
   - Practical limit: 10-15 participants
   - Reduce participant count

2. **Volume meter overhead**:
   - Meter uses requestAnimationFrame loop
   - Temporarily disable for testing:
   ```javascript
   window.volumeMeter.stopAnimation()
   ```

3. **Browser extensions**:
   - Disable all extensions temporarily
   - Test in Incognito/Private mode

### High Memory Usage

**Symptom**: Browser tab using > 500MB RAM

**Diagnosis**:

```javascript
// Browser console:
window.performance.memory
// usedJSHeapSize should be < 100MB for 5 participants
```

**Solutions**:

1. **Memory leak**:
   - Restart browser tab
   - Check for: `[App] Peer left` messages (cleanup should happen)
   - If participants leaving don't reduce memory, report bug

2. **Too many tracks**:
   - Each peer sends 2 streams (mic + return feed)
   - 10 peers = 20 streams
   - This is expected behavior

3. **Chrome task manager**:
   - Open: Shift+Esc (Chrome)
   - Sort by memory
   - Identify memory-hungry tabs/extensions

### Lag or Latency

**Symptom**: Mute button takes > 150ms, audio delay noticeable

**Diagnosis**:

Test mute latency:
```javascript
// Browser console:
const start = performance.now();
window.app.muteManager.setMute('<peerId>', true, 'producer');
window.app.audioGraph.applyMute('<peerId>', true);
const latency = performance.now() - start;
console.log(`Mute latency: ${latency.toFixed(2)}ms`);
// Should be < 150ms
```

**Solutions**:

1. **Network latency**:
   - WebRTC signaling adds ~50-100ms
   - Audio graph processing adds ~50ms
   - Total ~100-150ms is normal

2. **System overload**:
   - Close other applications
   - Check CPU/RAM usage

3. **Large buffer size**:
   - Web Audio uses native buffer size
   - Can't reduce without browser configuration

---

## Browser Compatibility

### Supported Browsers

| Browser | Version | Status | Notes |
|---------|---------|--------|-------|
| Chrome | 90+ | ✅ Recommended | Best WebRTC support |
| Edge | 90+ | ✅ Recommended | Chromium-based |
| Firefox | 88+ | ✅ Supported | Some WebRTC quirks |
| Safari | 14.1+ | ⚠️ Limited | RequiresRequires user gesture for getUserMedia |
| Mobile | Any | ❌ Not tested | Untested in MVP |

### Browser-Specific Issues

**Safari**:
- Requires user interaction before `getUserMedia()`
- May show permission prompt on every page load
- WebRTC support sometimes inconsistent
- **Recommendation**: Use Chrome for best experience

**Firefox**:
- ICE candidate gathering may be slower
- Perfect Negotiation implementation differs slightly
- Generally works well but test thoroughly

**Mobile Browsers**:
- Not officially supported in MVP
- Background tab suspension may break audio
- Limited testing performed

### Feature Detection

```javascript
// Check if browser supports required features
const supported = {
  webrtc: !!window.RTCPeerConnection,
  webaudio: !!window.AudioContext || !!window.webkitAudioContext,
  mediarecorder: !!window.MediaRecorder,
  getusermedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
};

console.log('Browser support:', supported);
// All should be true for OpenStudio to work
```

---

## Development Environment

### Tests Failing

**Symptom**: `./run-pre-validation.sh` shows failures

**Diagnosis**:

```bash
# Run individual test for detailed output
node tests/test-webrtc.mjs

# Check infrastructure
docker compose ps  # All should be "running" and "healthy"
curl http://localhost:6736/health  # Should return {"status":"ok"}
curl http://localhost:8086  # Should return HTML

# Check Playwright installation
npx playwright --version
```

**Solutions**:

1. **Infrastructure not running**:
   ```bash
   ./dev.sh  # Start all services
   ```

2. **Chromium not installed** (for Playwright):
   ```bash
   cd web
   npx playwright install chromium
   ```

3. **Port conflicts**:
   ```bash
   # Check what's using test ports
   lsof -i :6736 -i :8086
   # Stop conflicting services
   ```

4. **Stale browser cache**:
   - Playwright uses fresh profile each run
   - If issue persists, clear system DNS cache

### Hot Reload Not Working (Local Mode)

**Symptom**: Changes to `server/` files don't restart server

**Diagnosis**:

```bash
# Check .env configuration
cat .env | grep DEV_MODE
# Should show: DEV_MODE=local

# Check if using --watch flag
ps aux | grep "node.*server.js"
# Should show: node --watch server/server.js
```

**Solutions**:

1. **Not in local mode**:
   ```bash
   ./dev-switch.sh
   # Select option 2 (local)
   ./dev.sh
   ```

2. **Node.js too old**:
   - `--watch` flag requires Node.js 18.11+
   - Update Node.js: `node -v` should show 18.11.0 or higher

3. **File not in watch path**:
   - Only `server/` directory is watched
   - Changes to `web/` require browser refresh (no hot reload for client)

### Docker Build Failures

**Symptom**: `docker compose build` fails

**Diagnosis**:

```bash
# Check Docker version
docker --version  # Should be 20.10+

# Check disk space
docker system df

# View detailed build output
docker compose build --no-cache --progress=plain
```

**Solutions**:

1. **Insufficient disk space**:
   ```bash
   docker system prune -a  # Free up space
   ```

2. **Network issues during build**:
   - Check internet connection
   - Try again (npm install may timeout)
   - Use `--no-cache` to force fresh build

3. **Platform mismatch**:
   ```bash
   # Force platform (if on Apple Silicon)
   docker compose build --platform linux/arm64
   ```

---

## Getting Further Help

### Self-Service Resources

1. **Documentation**:
   - [Architecture Docs](../memory-bank/ARCHITECTURE.md)
   - [Signal Flow](../memory-bank/SIGNAL_FLOW.md)
   - [Quick Start Guide](../memory-bank/quick-start.md)

2. **Automated Tests**:
   ```bash
   # Tests document expected behavior
   cat tests/test-return-feed.mjs  # Example of complete workflow
   ```

3. **Memory Bank**:
   - `memory-bank/activeContext.md` - Current state
   - `memory-bank/progress.md` - What's working
   - `memory-bank/decisions.md` - Why things work this way

### Reporting Issues

If you can't resolve the issue:

1. **Gather Diagnostic Information**:
   ```bash
   # System info
   uname -a  # OS version
   node -v  # Node.js version
   docker --version  # Docker version

   # Service status
   docker compose ps > debug-docker-status.txt

   # Logs
   docker compose logs > debug-docker-logs.txt

   # Browser console
   # Copy all console output to debug-browser-console.txt
   ```

2. **Create GitHub Issue**:
   - Use bug report template
   - Include all diagnostic information
   - Describe steps to reproduce
   - Include screenshots if applicable

3. **Check Existing Issues**:
   - Search: https://github.com/msitarzewski/openstudio/issues
   - Your issue may already be reported/solved

### Community Support

- **GitHub Discussions**: Questions and support
- **Discord/Matrix**: Real-time chat (coming soon)

### Emergency Workarounds

**Nuclear Option** (fresh start):

```bash
# Stop everything
docker compose down
pkill -f "node.*server.js"
pkill -f "http.server 8086"

# Clean Docker state
docker system prune -a  # WARNING: Deletes all Docker data

# Re-clone repository (if needed)
cd ..
rm -rf openstudio
git clone https://github.com/msitarzewski/openstudio.git
cd openstudio

# Fresh setup
cp .env.example .env
cd server && npm install && cd ..
cd web && npm install && cd ..

# Start fresh
./dev.sh
```

**Temporary Disable Features** (for debugging):

```javascript
// Disable volume meter (reduce CPU)
// web/js/main.js, comment out:
// this.volumeMeter.startAnimation();

// Disable return feeds (simplify audio)
// web/js/main.js, comment out return feed logic

// Test with minimal setup first, add features incrementally
```

---

## Summary Checklist

When troubleshooting, go through this checklist:

- [ ] All Docker containers running and healthy
- [ ] Signaling server responding to `/health`
- [ ] Web server serving `index.html`
- [ ] Browser console shows no errors
- [ ] Microphone permission granted
- [ ] AudioContext in "running" state (not "suspended")
- [ ] WebRTC connections established ("connected", not "connecting")
- [ ] Audio graph has correct participant count
- [ ] No port conflicts (6736, 6737, 8086, 3478)
- [ ] Using supported browser (Chrome/Edge recommended)
- [ ] Headphones/earbuds used (not speakers)

**If all checks pass but issue persists → report as bug**

---

**Still stuck? We're here to help!**

Open an issue: https://github.com/msitarzewski/openstudio/issues
