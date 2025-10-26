# Safari WebAudio API Quirks & Workarounds

**Last Updated**: 2025-10-26

This document catalogs Safari-specific WebAudio API issues discovered during OpenStudio development and their solutions.

---

## Issue 1: AudioContext Suspension After Permission Dialog

### Symptom
AnalyserNode returns all zeros (silent) even though microphone permission is granted and MediaStream is active.

### Root Cause
Safari suspends the AudioContext during the getUserMedia() permission dialog. When the user grants permission and the dialog closes, the AudioContext remains in "suspended" state.

Creating audio nodes (AnalyserNode, MediaStreamSource, etc.) while the context is suspended causes them to not process audio data.

### Console Signature
```
[AudioContext] State changed: running
[RTC] Requesting microphone access...
[AudioContext] State changed: suspended  ← Happens during permission dialog
[RTC] Microphone access granted
[AnalyserNode created in SUSPENDED context - won't work]
```

### Solution
Explicitly call `audioContext.resume()` **after** `getUserMedia()` completes:

```javascript
// Get microphone permission
await navigator.mediaDevices.getUserMedia({ audio: true });

// Safari: Resume context after permission dialog
await audioContext.resume();

// NOW create audio nodes - context is running
const source = audioContext.createMediaStreamSource(stream);
const analyser = audioContext.createAnalyser();
```

**Implementation in OpenStudio**:
- `web/js/main.js:175` (room-created event)
- `web/js/main.js:215` (room-joined event)

---

## Issue 2: Zero-Gain Nodes Trigger Auto-Suspension

### Symptom
AudioContext enters "suspended" state shortly after starting, even when connected to destination.

### Root Cause
Safari's power-saving logic detects when audio output is completely silent (gain = 0.0) and suspends the AudioContext to save resources. This breaks all audio processing including AnalyserNodes.

### Solution
Use **ultra-low gain** (0.001) instead of zero:

```javascript
const gain = audioContext.createGain();
gain.gain.value = 0.001;  // NOT 0.0
// 0.001 = 0.1% volume = -60dB (inaudible to humans)
```

This is quiet enough to be inaudible but signals to Safari that audio is "active."

**Implementation in OpenStudio**:
- `web/js/main.js:1082-1083` (local participant meter)

---

## Issue 3: MediaStreamSource Must Connect to Destination

### Symptom
AnalyserNode doesn't receive data from MediaStreamSource in Safari (works in Chrome/Firefox).

### Root Cause
Safari requires MediaStreamSource nodes to be part of an **active audio graph** that ultimately connects to `audioContext.destination`. Isolated analysers don't work.

### Solution
Always connect MediaStreamSource to destination, even if through a near-silent gain node:

```javascript
// Chrome/Firefox: This works
source.connect(analyser);

// Safari: Need this
source.connect(analyser);
analyser.connect(ultraLowGain);
ultraLowGain.connect(audioContext.destination);
```

**Implementation in OpenStudio**:
- `web/js/main.js:1087-1089` (local meter routing)

---

## Issue 4: Canvas Rendering Delay

### Symptom
Canvas element stays black initially, even when VolumeMeter is running. White peak indicator doesn't appear until first audio peak.

### Root Cause
Safari delays initial canvas rendering until there's actual data to draw. The canvas context exists but Safari doesn't paint until necessary.

### Impact
**Cosmetic only** - meter works correctly, just appears blank until user speaks.

### Workaround
None needed - the green bar appears as soon as audio is detected. This is a minor visual quirk, not a functional bug.

---

## Testing Checklist for Safari

When implementing WebAudio features, verify in Safari:

- [ ] AudioContext state is "running" before creating nodes
- [ ] AudioContext.resume() called after getUserMedia()
- [ ] Gain nodes use > 0.0 value (recommend 0.001)
- [ ] MediaStreamSource connects to destination (through gain if needed)
- [ ] Console shows no "suspended" state changes during operation
- [ ] AnalyserNode.getByteTimeDomainData() returns non-zero values

---

## Browser Compatibility Matrix

| Feature | Chrome | Firefox | Brave | Safari |
|---------|--------|---------|-------|--------|
| MediaStreamSource | ✅ | ✅ | ✅ | ⚠️ Quirks |
| AnalyserNode | ✅ | ✅ | ✅ | ⚠️ Quirks |
| Zero-gain nodes | ✅ | ✅ | ✅ | ❌ Suspends |
| Isolated analyser | ✅ | ✅ | ✅ | ❌ No data |
| Permission timing | ✅ | ✅ | ✅ | ⚠️ Suspends |

**Recommendation**: Test in Safari early and often. What works in Chrome may not work in Safari.

---

## References

- [WebAudio API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaStreamAudioSourceNode - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamAudioSourceNode)
- [Safari WebAudio Issues - GitHub](https://github.com/WebAudio/web-audio-api/issues?q=safari)
- Stack Overflow: [Safari MediaStreamSource AnalyserNode not working](https://stackoverflow.com/questions/16724414/)

---

**Discovered by**: Testing OpenStudio per-participant level meters (October 2025)
**Impact**: Critical for any real-time audio visualization in Safari
**Status**: Workarounds implemented and tested ✅
