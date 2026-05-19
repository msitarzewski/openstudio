# Active Context: OpenStudio

**Last Updated**: 2026-05-18 (Task 3: Download All Tracks as Zip — In Progress)

## Current Phase

**Release**: 0.3-dev + Power Move (Podcast Production)
**Branch**: `main` (power-move merged, all work on main)
**Status**: Podcast production pipeline in progress — Tasks 1-2 done, Task 3 in progress
**Focus**: Building podcast MVP features on top of existing audio pipeline

## Recent Updates (2026-05-18)

### Task 1: Show Notes from Transcript ✅ COMPLETE
- **New file:** `server/lib/show-notes-generator.js` — LLM-powered episode title + summary generation via LM Studio (Qwen 35B), with graceful fallback if LLM unavailable
- **Server endpoint:** `POST /api/export/show-notes` — accepts transcript segments JSON, returns `{title, summary, segments}`
- **UI:** New "Post-Production" section below export panel — transcribe button → auto-generate show notes via whisper.cpp + LLM → display in editable panel with segment markers
- **Actions:** Copy to clipboard (formatted markdown) or Download as `.md` file with episode title, summary, and timestamped segments
- **Flow:** Stop recording → see Export panel → scroll to "— or —" divider → click "Transcribe Recording" → show notes appear in panel
- **Fallback:** If LM Studio is unreachable, generates generic title from transcript words + uses raw transcript as summary

## Recent Decisions

### 2026-03-14: Signal UX Redesign — CSS-Driven State Management

**Decision**: Use `body.broadcasting` CSS class as the single source of truth for all visual broadcast state changes.

**Rationale**:
- One class toggle cascades to all visual elements (header border, wordmark color, card accents, vignette warmth, signal bar)
- CSS handles all transitions/animations — JS only adds/removes the class
- Simpler than managing individual element states in JavaScript

**Implementation**:
- `main.js:handleStartSession()` adds `body.broadcasting`
- `main.js:handleEndSession()` removes `body.broadcasting`
- All ON AIR visual effects defined in `studio.css` under `body.broadcasting` selectors

### 2026-03-14: Signal Design System — Color Temperature as Meaning

**Decision**: Replace generic Tailwind-default colors with purpose-built "Signal and Noise" palette using two emotional temperatures.

**Rationale**:
- Warm signal (amber standby, red live) = active broadcast elements
- Cold void (near-black with blue undertones) = background/inactive
- Amber through range instead of green/yellow/red traffic light pattern
- Warm white text (#e8e4df) instead of blue-white for incandescent feel

### 2026-03-14: Segmented LED Meters + Waveform Oscilloscope

**Decision**: Replace flat bar meters with hardware-style segmented LEDs and add waveform oscilloscope display.

**Rationale**:
- Segmented LEDs with ghost segments look like real studio hardware
- Waveform provides visual feedback even at low levels
- Speaking detection via VolumeMeter callback drives card glow animations

### 2026-03-14: Terminology Changes for Broadcast Feel

**Decision**: Rename UI labels to pirate radio / broadcast engineering language.

**Changes**:
- "Program Bus" → "SIGNAL OUTPUT"
- "Streaming" → "TRANSMITTING" (when active)
- "Guest" → "Caller"
- "Ops" → "Engineer"
- Empty state: "The frequency is clear."
- "talk hard." tagline (Pump Up the Volume reference)

## Current Working Context

### Architecture (v0.3-dev — Signal UX)

```
Client (browser) ──────────────── Node.js Server (port 6736)
  │                                  ├─ /health
  │                                  ├─ /api/station (no ICE creds)
  ├─ WebSocket (signaling) ──────────├─ WebSocket (ws, 256KB max, rate limited)
  │   ├─ register → registered       │   ├─ JWT room token on join/create
  │   ├─ create-or-join-room ────────│   ├─ ICE config (incl TURN) in response
  │   ├─ request-invite ─────────────│   ├─ Invite token generation (host/ops)
  │   └─ mute (RBAC enforced) ──────│   └─ Per-IP conn limit (10)
  ├─ Static files ───────────────────├─ /web/* (X-Content-Type-Options, nosniff)
  ├─ Stream listener ────────────────├─ /stream/* → Icecast:6737 (path sanitized)
  │                                  ├─ Security headers (X-Frame-Options, etc.)
  │                                  ├─ CORS allowlist (ALLOWED_ORIGINS)
  │                                  └─ 404
  ├─ WebRTC mesh (peer-to-peer)
  ├─ Web Audio (mix-minus + program bus)
  ├─ MediaRecorder (recording)
  ├─ Fetch/WS → Icecast (streaming, host/ops only)
  └─ Signal UX Design System
       ├─ Space Grotesk / Inter / JetBrains Mono (Google Fonts)
       ├─ Void/Signal/Data color palette
       ├─ Segmented LED meters + waveform oscilloscope
       ├─ ON AIR animations (body.broadcasting CSS class)
       ├─ Channel strip cards with speaking detection
       └─ Collapsible deck panels (recording, streaming)
```

### Key Files Modified in Signal UX

| File | Change |
|------|--------|
| `web/index.html` | Google Fonts, signal chain layout, wordmark+tagline, waveform canvas, deck panels |
| `web/css/studio.css` | Complete rewrite — Signal design system tokens, atmosphere, components, animations |
| `web/js/main.js` | body.broadcasting state, speaking detection, card animations, deck panels, role names |
| `web/js/volume-meter.js` | Segmented LED mode, waveform oscilloscope mode, speaking callback, HiDPI |

## Blockers & Risks

### Signal UX
- Google Fonts CDN dependency (fonts load from external CDN — could self-host for zero-dependency)
- `prefers-reduced-motion` disables all animations but visual design still works

### Pending from Previous
- PR #1 (v0.2.1 Security Hardening) still needs merge
- JWT_SECRET must be set in production
- TURN credentials in station-manifest need real values
