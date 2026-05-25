# OpenStudio — Progress Tracker

**Updated**: 2026-05-18 (Podcast Production Pipeline)

## v0.3-dev Core Features (Complete)
- ✅ WebRTC audio mesh with mix-minus per participant
- ✅ Per-participant gain + mute controls via compressor nodes
- ✅ Stereo program bus merger → analyser meters (segmented LEDs + waveform)
- ✅ Multi-track recording (per-participant + program mix via MediaRecorder API)
- ✅ Icecast streaming support (host/ops only)
- ✅ JWT room tokens, per-IP limits, CORS allowlist, binary-safe multipart parsing
- ✅ Signal UX redesign — space Grotesk/Inter/JetBrains Mono, void/signal color system, ON AIR animations
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

## Technical Notes
- All podcast features built on `main` branch (power-move already merged)
- LM Studio at `http://10.211.55.2:1234/v1` (host Mac, Parallels NAT IP)
- whisper.cpp models stored in `models/` directory (auto-download from HuggingFace)
- ffmpeg pipeline: silence detect → filler splice → concat segments → two-pass loudnorm to -16 LUFS
