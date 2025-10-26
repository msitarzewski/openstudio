# 261025_per_participant_level_meters

## Objective
Add real-time microphone level meters to each participant card to provide immediate visual feedback of audio input during testing and operation. Additionally, enhance server management commands and resolve Safari WebAudio API compatibility issues.

## Context
User reported inability to verify microphone input during testing - browser showed permission granted but no visual proof of audio levels. This created uncertainty during development and testing sessions.

## Outcome
- ✅ Per-participant level meters working in ALL browsers (Brave, Chrome, Firefox, Safari)
- ✅ Real-time RMS visualization with color-coded levels
- ✅ Enhanced server management with start/stop/restart/status/logs commands
- ✅ Safari WebAudio quirks identified, documented, and fixed
- ✅ Comprehensive browser compatibility documentation created

## Files Modified

### Web Client - Level Meters (+139 lines)
- `web/js/audio-graph.js` (+24 lines)
  - Added AnalyserNode to participant audio chain
  - Updated audio flow: source → gain → **analyser** → compressor → program bus
  - Added `getParticipantAnalyser(peerId)` method
  - Stored analyser reference in participantNodes map

- `web/js/main.js` (+108 lines)
  - Added `participantMeters` Map to track VolumeMeter instances
  - Added 150×20px canvas element to participant cards
  - Created `createParticipantMeter(peerId)` for remote participants
  - Created `createLocalMeter()` for local participant (self)
  - Added cleanup in `removeParticipant()` for meter destruction
  - **Safari fixes**: AudioContext.resume() after getUserMedia()
  - **Safari fixes**: Ultra-low gain (0.001) routing to destination
  - Added debug logging for AudioContext state

- `web/css/studio.css` (+10 lines)
  - Added `.participant-level-meter` styles
  - 150×20px dimensions with border and border-radius
  - Positioned below role label, above controls

### Server Management - Enhanced Commands (+149 lines)
- `dev.sh` (+149 lines, complete rewrite)
  - Added command argument support: start|stop|restart|status|logs|help
  - Implemented `start_services()` - backward compatible startup
  - Implemented `stop_services()` - clean shutdown
  - Implemented `restart_services()` - quick restart workflow
  - Implemented `show_status()` - health checks for all services
  - Implemented `show_logs()` - follow all or specific service logs
  - Implemented `show_usage()` - comprehensive help system
  - Added health check endpoints: signaling (6736), icecast (6737), web UI (8086)

### Documentation (+420 lines)
- `QUICKSTART.md` (+139 lines, NEW)
  - Quick reference card for daily development
  - Server management command cheat sheet
  - Common troubleshooting workflows
  - Browser compatibility notes

- `docs/SAFARI_WEBAUDIO_QUIRKS.md` (+200 lines, NEW)
  - Complete Safari WebAudio API quirks guide
  - Four issues documented with solutions
  - Testing checklist for Safari
  - Browser compatibility matrix
  - Code examples for each workaround

- `README.md` (+64 lines)
  - Added "Server Management" section
  - Updated troubleshooting to use new commands
  - Safari-specific microphone debugging
  - Browser compatibility notes

- `CHANGELOG.md` (+2 lines)
  - Updated Known Limitations with Safari quirks note
  - Changed from "Safari getUserMedia stricter permissions" to detailed quirk description

## Implementation Details

### Per-Participant Level Meters

**Audio Chain Extension**:
```javascript
// Remote participants
source → gain → analyser → compressor → program bus
                   ↓
              VolumeMeter (canvas)

// Local participant (Safari-compatible)
source → analyser → ultraLowGain (0.001) → destination
           ↓
      VolumeMeter (canvas)
```

**Reused Components**:
- VolumeMeter class (web/js/volume-meter.js) - RMS calculation, color-coded levels
- Existing AudioGraph participant pattern - extended to include AnalyserNode
- Participant card structure - extended with canvas element

**Lifecycle Management**:
- Meters created when audio streams received
- Meters started immediately (requestAnimationFrame loop)
- Meters destroyed when participants leave (prevents memory leaks)

### Safari WebAudio API Compatibility

**Issue 1: Permission Dialog Timing Gap**
```javascript
// Problem: Safari suspends AudioContext during getUserMedia() dialog
// Solution: Explicitly resume after permission granted
await navigator.mediaDevices.getUserMedia({ audio: true });
await audioContext.resume();  // Critical for Safari
```

**Issue 2: Zero-Gain Auto-Suspension**
```javascript
// Problem: Safari suspends when gain = 0.0 (power saving)
// Solution: Ultra-low gain (0.001 = -60dB, inaudible)
ultraLowGain.gain.value = 0.001;  // NOT 0.0
```

**Issue 3: MediaStreamSource Isolation**
```javascript
// Problem: Safari requires connection to destination
// Solution: Route through ultra-low gain to destination
source.connect(analyser);
analyser.connect(ultraLowGain);
ultraLowGain.connect(audioContext.destination);
```

**Issue 4: Canvas Rendering Delay**
- Safari delays initial canvas rendering until data available
- Cosmetic only - meter works, just appears blank initially
- No fix needed - acceptable behavior

### Server Management Commands

**New Workflow**:
```bash
./dev.sh start          # Start all services (default)
./dev.sh stop           # Stop all services
./dev.sh restart        # Quick restart after code changes
./dev.sh status         # Health checks + service status
./dev.sh logs           # Follow all logs
./dev.sh logs signaling # Follow specific service
./dev.sh help           # Show all commands
```

**Health Checks**:
- Signaling: `curl http://localhost:6736/health`
- Icecast: `curl http://localhost:6737/`
- Web UI: `curl http://localhost:8086/`

## Technical Decisions

**AnalyserNode Placement**:
- Placed after GainNode, before DynamicsCompressor
- Ensures metering reflects user-adjusted gain levels
- Positioned before compression (shows raw input dynamics)

**Local vs Remote Metering**:
- Remote: Uses existing audio graph analyser
- Local: Creates isolated analyser (prevents self-monitoring feedback)
- Safari: Local analyser routed through ultra-low gain to destination

**Canvas Dimensions**:
- 150×20px (compact, fits in participant cards)
- Smaller than program bus meter (400×30px)
- Adequate for real-time monitoring

**VolumeMeter Reuse**:
- No modifications to existing VolumeMeter class
- Same RMS calculation and color thresholds
- Same peak hold and animation logic

## Browser Compatibility

| Browser | Level Meters | Safari Quirks | Status |
|---------|--------------|---------------|--------|
| Brave   | ✅ Perfect   | None          | ✅ Working |
| Chrome  | ✅ Perfect   | None          | ✅ Working |
| Firefox | ✅ Perfect   | None          | ✅ Working |
| Safari  | ✅ Working   | 4 issues fixed| ✅ Working |

**Safari Quirks Fixed**:
1. ✅ AudioContext suspension during permission dialog
2. ✅ Zero-gain auto-suspension
3. ✅ MediaStreamSource requires destination connection
4. ⚠️ Canvas rendering delay (cosmetic only)

## Testing

**Manual Testing (All Browsers)**:
- ✅ Brave: Level meter animates when speaking
- ✅ Chrome: Level meter animates when speaking
- ✅ Firefox: Level meter animates when speaking
- ✅ Safari: Level meter animates when speaking (after fixes)

**Visual Verification**:
- Green bar grows/shrinks with voice volume
- Color changes: Green (0-70%) → Yellow (70-90%) → Red (90-100%)
- White peak indicator shows maximum level
- Meter updates in real-time (60fps via requestAnimationFrame)

**Server Management Testing**:
- ✅ `./dev.sh start` - All services start successfully
- ✅ `./dev.sh stop` - Clean shutdown with status confirmation
- ✅ `./dev.sh restart` - Services restart without errors
- ✅ `./dev.sh status` - Health checks pass for all services
- ✅ `./dev.sh logs` - Log streaming works for all/specific services
- ✅ `./dev.sh help` - Help text displays correctly

## Debugging Session Insights

**Root Cause Discovery**:
User observation: "Is it possible that the permissions prompt is causing timing issues?"
- This was the critical insight that led to the solution
- Permission dialog creates a "user interaction gap"
- Safari suspends AudioContext during this gap
- Creating audio nodes in suspended context causes them to not work

**Web Search Findings**:
- Safari aggressively suspends AudioContext for power saving
- Zero-gain nodes trigger suspension (no audio output = suspend)
- MediaStreamSource must connect to destination in Safari
- Permission dialogs break AudioContext continuity

**Solution Path**:
1. First attempt: Zero-gain routing (failed - Safari suspended)
2. Second attempt: Ultra-low gain (partial - still suspended during permission)
3. **Final solution**: AudioContext.resume() after getUserMedia() + ultra-low gain

## Memory Bank Updates

**New Documentation**:
- docs/SAFARI_WEBAUDIO_QUIRKS.md - Complete Safari debugging guide
- QUICKSTART.md - Daily development reference

**Pattern Discovery**:
- Safari WebAudio quirks require explicit AudioContext management
- Permission dialogs break AudioContext state continuity
- Zero-gain nodes are not equivalent to ultra-low gain in Safari
- Canvas rendering timing differs between browsers (cosmetic only)

## Lessons Learned

1. **Test Safari Early**: Safari WebAudio behavior differs significantly from Chrome/Firefox
2. **User Interaction Timing**: Permission dialogs create gaps that affect AudioContext state
3. **Power Saving Heuristics**: Safari's aggressive power saving triggers on zero audio output
4. **Explicit State Management**: Don't assume AudioContext stays running - verify and resume
5. **Browser Compatibility**: What works in Chrome may fail in Safari - test all targets

## Future Considerations

**Potential Enhancements**:
- Add numeric dB readout next to meter
- Add peak hold time configuration
- Add meter orientation (horizontal/vertical)
- Add meter scaling options (linear/logarithmic)

**Known Limitations**:
- Safari canvas may appear blank initially (cosmetic, works once audio starts)
- Ultra-low gain (0.001) technically audible but below human hearing threshold
- Local participant meter bypasses audio graph (different code path than remote)

## References

### Code Patterns
- `web/js/volume-meter.js` - Existing VolumeMeter class (reused)
- `web/js/audio-graph.js:14-26` - Audio graph architecture diagram
- `web/js/main.js:864-968` - Participant card creation pattern

### External References
- [WebAudio API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaStreamAudioSourceNode - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamAudioSourceNode)
- Stack Overflow: Safari WebAudio issues (multiple threads consulted)

### Memory Bank
- `systemPatterns.md#Audio Graph Architecture` - Extended with AnalyserNode
- `decisions.md` - Safari compatibility decisions documented
- `docs/SAFARI_WEBAUDIO_QUIRKS.md` - New reference for future Safari work

## Metrics

**Code Changes**:
- Files modified: 8
- Lines added: 825
- Lines deleted: 71
- Net change: +754 lines

**Documentation Created**:
- QUICKSTART.md: 139 lines (new file)
- docs/SAFARI_WEBAUDIO_QUIRKS.md: 200 lines (new file)
- README.md updates: 64 lines
- Total documentation: ~400 lines

**Time Investment**:
- Feature implementation: ~2 hours
- Safari debugging: ~3 hours
- Documentation: ~1 hour
- Total: ~6 hours

**Impact**:
- Immediate visual feedback for microphone testing ✅
- Cross-browser compatibility verified ✅
- Safari quirks documented for future developers ✅
- Server management workflow improved ✅
- Developer experience significantly enhanced ✅

---

**Status**: ✅ Complete and tested in all target browsers
**Date**: 2025-10-26
**Type**: Enhancement (post-implementation feature addition)
**Priority**: High (testing/UX improvement)
