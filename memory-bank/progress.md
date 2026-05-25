# OpenStudio — Progress Tracker

**Updated**: 2026-05-25 (v0.3.0 release cut + podcast production pipeline in progress)

## v0.3.0 Release Cut ✅ (2026-05-25)
- ✅ `package.json` bumped 0.2.0 → 0.3.0
- ✅ Self-hosted Inter / JetBrains Mono / Space Grotesk as variable woff2 (latin subset, ~100 KB total in `web/fonts/`); removed Google Fonts CDN dependency
- ✅ `server/lib/static-server.js` adds `.woff2` / `.woff` MIME types
- ✅ Connection-status pill moved from header center back to header right (regression from Signal redesign `490fdc9`); header grid simplified, mobile responsive grid updated
- ✅ Verified via Chrome DevTools MCP — zero external font requests, status pill 40px from right edge
- See `tasks/2026-05/250526_v030_release.md`

## v0.3 Core Features (Complete)
- ✅ WebRTC audio mesh with mix-minus per participant
- ✅ Per-participant gain + mute controls via compressor nodes
- ✅ Stereo program bus merger → analyser meters (segmented LEDs + waveform)
- ✅ Multi-track recording (per-participant + program mix via MediaRecorder API)
- ✅ Icecast streaming support (host/ops only)
- ✅ JWT room tokens, per-IP limits, CORS allowlist, binary-safe multipart parsing
- ✅ Signal UX redesign — Space Grotesk / Inter / JetBrains Mono (self-hosted v0.3.0), void/signal color system, ON AIR animations
- ✅ WebSocket signaling protocol with ICE config delivery
- ✅ Station manifest configuration

## Podcast Production (Power Move) — In Progress

### Task 1: Show Notes from Transcript ✅ COMPLETE
- Server endpoint `/api/export/show-notes` with LLM-powered title/summary via LM Studio (Qwen 35B)
- UI panel: transcribe → auto-generate show notes + segment markers + copy/download as markdown
- Fallback: generates title from transcript words if LLM unavailable

### Task 2: MP3 Export Alongside WAV ✅ COMPLETE
- Server extracts `outputFormat` from multipart form field
- ffmpeg `-codec:a libmp3lame -qscale:a 2` transcode when MP3 selected
- Returns `audio/mpeg` with clean filename

### Task 3: Download All Tracks as Zip Bundle 🔄 IN PROGRESS
- archiver installed, imported in server.js
- Need: zip endpoint on server, frontend handler to send all track blobs

### Task 4: Click-to-Cut on Transcript ⏳ TODO
### Task 5: Per-Segment Recording ⏳ TODO
### Task 6: Episode Metadata Export (ID3 tags) ⏳ TODO
### Task 7: Auto-Chapter Markers in Audio (VTT/ICU) ⏳ TODO
### Task 8: Multi-Track to Final Export ⏳ TODO

## What's Next

### Immediate
1. **Commit + push v0.3.0** — release notes ready, deploy after merge
2. **Deploy to production** — `openstudio.zerologic.com` (Power Move + v0.3.0 + podcast Tasks 1-2 not yet live)
3. **Finish Task 3** — zip bundle endpoint + frontend wiring (archiver already installed)

### Short Term
1. **favicon.ico** — silence the lone 404 noted during v0.3.0 verification
2. **Per-participant waveform** (stretch from Signal plan) — replace static avatar with live waveform
3. **Broadcast tone** (optional) — 1kHz / 150ms cue at ON AIR transition

### Release 0.4 (Planned — Discovery & Identity)
- DHT station discovery (WebTorrent or libp2p)
- Nostr NIP-53 integration
- Ed25519 station identities

### Release 0.5 (Planned — Scale)
- SFU for larger rooms (25+ participants)
- Soundboard / jingle playback
- Text chat

## Technical Notes
- All podcast features built on `main` branch (power-move already merged)
- LM Studio at `http://10.211.55.2:1234/v1` (host Mac, Parallels NAT IP) — required for show-notes LLM; graceful fallback exists
- whisper.cpp models stored in `models/` directory (auto-download from HuggingFace)
- whisper.cpp is a gitlink without `.gitmodules` config — clone setup is manual, not via `git submodule update`
- ffmpeg pipeline: silence detect → filler splice → concat segments → two-pass loudnorm to -16 LUFS
- Self-hosted fonts use variable woff2 (latin subset only); non-Latin glyphs fall back to system fonts
