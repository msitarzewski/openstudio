# 140326_signal_ux_redesign

## Objective

Complete UX redesign of OpenStudio web client — codename "Signal". Transform the functional but generic dark-themed UI into an atmospheric broadcast experience inspired by *Pump Up the Volume* (1990). The design makes the broadcaster feel like they are doing something that matters.

## Outcome

- ✅ Tests: All 3 E2E tests passing (WebRTC, Recording, Return Feed)
- ✅ Build: No new errors introduced
- ✅ Review: Approved

## Files Modified

- `web/index.html` — Added Google Fonts (Space Grotesk, Inter, JetBrains Mono), restructured into signal chain layout (Stage → Signal Output → Transport → Deck), added wordmark with accent + tagline, waveform canvas, collapsible deck panels for recording/streaming, semantic classes
- `web/css/studio.css` — Complete rewrite: new token system (void/signal/data/text), atmospheric background (scan lines, vignette, noise texture), ON AIR animations, channel strip cards, transport controls, deck panels, segmented LED meter colors, accessibility (prefers-reduced-motion, focus-visible)
- `web/js/main.js` — Body class state management (`broadcasting`), speaking detection via VolumeMeter callback, card enter/exit animations (tune-in/tune-out), deck panel toggle, empty state text ("The frequency is clear."), role display names (Guest→Caller, Ops→Engineer), waveform display initialization, mute button text changed from emoji to uppercase text
- `web/js/volume-meter.js` — Segmented LED meter mode (32 segments program / 16 per-participant), waveform oscilloscope mode, amber→red color ramp (not green/yellow/red), ghost segments, peak hold with decay, speaking detection callback, high-DPI canvas support, color lerp utility

## Design System — "Signal and Noise"

### Color Palette
- **Void**: Near-black with blue undertones (`#0a0a0f` → `#232736`)
- **Signal**: Amber standby (`#d4a053`), red live (`#e23636`)
- **Data**: Cyan for informational elements (`#00e5ff`)
- **Text**: Warm white (`#e8e4df`), not blue-white

### Typography
- Space Grotesk: Display/headings/buttons
- Inter: Body text
- JetBrains Mono: Timers, meters, technical data

### Key Design Decisions
- 3px border-radius (hardware doesn't have rounded corners)
- Rectangular gain slider thumbs (14x22px fader style)
- Monospaced role badges with role-specific border colors
- Transport buttons: amber-outlined primary, ghost secondary, understated end
- Scan lines + noise texture + vignette for atmosphere
- "talk hard." tagline — lowercase italic whisper, the only HHH textual reference

### Animations
- ON AIR: 2px red line ignites at viewport top, red wash flash, vignette warms, wordmark shifts to red
- Card enter: fade up + blur-to-sharp (tune-in, 500ms)
- Card exit: scale-down + blur (tune-out, 400ms)
- Speaking: amber glow on card border + avatar ring, 300ms hold
- REC blink: `steps(1)` mechanical blink (not smooth)

### Terminology Changes
- "Program Bus" → "SIGNAL OUTPUT"
- "Streaming" → "TRANSMITTING" (when active)
- "Guest" → "Caller"
- "Ops" → "Engineer"
- Empty state: "The frequency is clear."

## Bug Fixes During Implementation

### Waveform Canvas Sizing
- **Problem**: Waveform canvas stretched to ~180px instead of 48px; `setupHiDPI()` ran in constructor before CSS layout was finalized
- **Fix**: Added explicit `height: 48px` to `.waveform-canvas` CSS; deferred `setupHiDPI()` from constructor to `start()` method

### Program Bus Missing Local Mic
- **Problem**: Host's local microphone was never connected to the program bus — Signal Output showed silence when broadcasting solo
- **Fix**: `createLocalMeter()` now routes local mic through a compressor into the program bus (`source → analyser → compressor → programBus`). Removed the old `ultraLowGain → destination` Safari workaround since the program bus already connects to `audioContext.destination`.

## Patterns Applied

- `systemPatterns.md#Web Audio Graph for Mixing` — VolumeMeter extended with speaking detection and waveform mode; local mic now routed into program bus for complete broadcast mix
- `projectRules.md#JavaScript Style` — ES modules, camelCase, single quotes
- Existing VolumeMeter API preserved (constructor, start, stop, destroy, getCurrentLevel, setAnalyser)

## Integration Points

- `volume-meter.js` constructor now accepts optional `options` object with `mode` and `onSpeaking` callback
- `main.js` adds `body.broadcasting` class on session start, removes on end
- Deck panels are self-contained (click to toggle, start collapsed)
- Recording/streaming buttons moved to transport bar; deck panels show details only

## Architectural Decisions

- Decision: CSS-driven state management via body classes rather than JS DOM manipulation
- Rationale: Single source of truth for broadcast state, all visual changes cascade from one class toggle
- Trade-offs: Less granular JS control, but simpler and more maintainable

## Artifacts

- Branch: `feat/signal-ux-redesign`
