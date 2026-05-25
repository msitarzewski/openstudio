# OpenStudio — Progress Tracker

**Updated**: 2026-05-25 (v0.3.1 cut — MP3 + zip + LLM config fixes, README rewrite)

## v0.3.1 Release ✅ (2026-05-25)
- ✅ MP3 export from the recording deck now produces a real MP3 (was throwing `ReferenceError`; also fixed pre-existing multipart parser bug where the last form field swallowed the trailing boundary, silently defaulting to WAV)
- ✅ `POST /api/export/zip` defined and tested — streams a single archive of all tracks via `archiver`, 500 MB cap, preserves filenames
- ✅ Studio UI "Download All" wired to the zip endpoint; falls back to per-track downloads on any failure
- ✅ Show-notes LLM endpoint env-driven via `LLM_BASE_URL` / `LLM_MODEL`; default `http://localhost:1234/v1` / `qwen3.5-35b`; removed hardcoded private dev IP
- ✅ README rewritten — features grouped (Broadcast core / Recording & post-production / Optional AI tooling / Security & ops); new "Optional AI Tooling" section with whisper.cpp + LLM setup; new "Known Gaps" section; Roadmap updated
- ✅ Version 0.3.0 → 0.3.1
- ✅ Smoke-tested on host node process; all paths verified
- See `tasks/2026-05/260525_v031_fixes.md`

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

## Podcast Production (Power Move)

### Task 1: Show Notes from Transcript ✅ COMPLETE (v0.3.0)
- Server endpoint `/api/export/show-notes` with LLM-powered title/summary
- UI panel: transcribe → auto-generate show notes + segment markers + copy/download as markdown
- v0.3.1: LLM endpoint now env-driven (`LLM_BASE_URL` / `LLM_MODEL`), defaults to LM Studio's standard `localhost:1234`
- Fallback: generates title/summary from transcript text if LLM unreachable

### Task 2: MP3 Export Alongside WAV ✅ COMPLETE (actually works as of v0.3.1)
- Server extracts `outputFormat` from multipart form field
- ffmpeg `-codec:a libmp3lame -qscale:a 2` transcode when MP3 selected
- Returns `audio/mpeg` with clean filename
- v0.3.1 unbroke this: missing `run()` import + multipart parser bug that swallowed `outputFormat` value

### Task 3: Download All Tracks as Zip Bundle ✅ COMPLETE (v0.3.1)
- `POST /api/export/zip` streams all tracks back as a single archive via `archiver`
- Studio UI "Download All" wired to the new endpoint; falls back to per-track downloads on failure
- 500 MB cap, preserves filenames from `Content-Disposition`

### Task 4: Click-to-Cut on Transcript ⏳ TODO
### Task 5: Per-Segment Recording ⏳ TODO
### Task 6: Episode Metadata Export (ID3 tags) ⏳ TODO
### Task 7: Auto-Chapter Markers in Audio (VTT/ICU) ⏳ TODO
### Task 8: Multi-Track to Final Export ⏳ TODO

## What's Next

### Immediate
1. **Deploy v0.3.1 to production** — `openstudio.zerologic.com` (Power Move + v0.3.0 + v0.3.1 not yet live)
2. **Resume podcast Tasks 4-8** — click-to-cut on transcript, per-segment recording, ID3 tags, chapter markers, multi-track to final export

### Short Term
1. **favicon.ico** — silence the lone 404 noted during v0.3.0 verification
2. **Per-participant waveform** (stretch from Signal plan) — replace static avatar with live waveform
3. **Broadcast tone** (optional) — 1kHz / 150ms cue at ON AIR transition
4. **Invite-link UI** — server supports `request-invite` and the client knows how to consume invite tokens, but there's no host UI to mint one (deferred to 0.4)
5. **AI setup script** (`setup-ai.sh`) — automate whisper.cpp clone, build, and model download; flagged in README's Known Gaps

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
- LLM endpoint via `LLM_BASE_URL` / `LLM_MODEL` env vars; default `http://localhost:1234/v1` / `qwen3.5-35b` (matches LM Studio's standard port). Operators on non-default host/port override via `.env`. Graceful fallback when unreachable.
- whisper.cpp models stored in `models/` directory (auto-download from HuggingFace on first transcribe, ~1.5 GB for `ggml-medium.bin`)
- whisper.cpp is a gitlink without `.gitmodules` config — clone setup is manual, not via `git submodule update`
- ffmpeg pipeline: silence detect → filler splice → concat segments → two-pass loudnorm to -16 LUFS → optional MP3 transcode (`libmp3lame -qscale:a 2`)
- Self-hosted fonts use variable woff2 (latin subset only); non-Latin glyphs fall back to system fonts
- `archiver` is now an explicit `server/package.json` dep — a fresh clone needs `cd server && npm install` before the signaling server can boot
