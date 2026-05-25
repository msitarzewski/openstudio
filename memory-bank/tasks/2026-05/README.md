# Tasks — May 2026

## Tasks Completed

### 2026-05-18: Podcast Production Pipeline (commit `dc39b00`)
- **Task 1 — Show Notes from Transcript** ✅ — `server/lib/show-notes-generator.js` calls LM Studio (Qwen 35B) for episode title + summary; UI panel under the Export deck with editable title, summary, segment markers, and copy/download as markdown. Graceful fallback if LM Studio unreachable.
- **Task 2 — MP3 Export Alongside WAV** ✅ — Output format selector in Export panel now includes MP3; server transcodes via `ffmpeg -codec:a libmp3lame -qscale:a 2`.
- **Task 3 — Download All Tracks as Zip Bundle** 🔄 In Progress — `archiver` installed and imported into `server.js`; endpoint + frontend handler still pending.
- Files: `server/lib/show-notes-generator.js` (new), `server/server.js`, `server/package.json`, `web/js/main.js`, `web/js/recording-manager.js`, `web/index.html`, `web/css/studio.css`
- Done on a separate machine; pulled into this clone before the v0.3.0 commit landed

### ~2026-05 (early): Power Move — Whisper.cpp + Audio Cleaning Pipeline (PR #8)
- Added server-side audio transcription and cleaning, turning OpenStudio from a live studio tool into a post-production tool too
- Whisper.cpp git submodule for on-device transcription (privacy-preserving, no cloud API)
- Audio cleaning pipeline: noise reduction → loudness normalization → filler/silence splice detection → ffmpeg export
- Clean/Raw export toggle in the recording deck
- New endpoints: `POST /api/upload`, `GET/POST /api/export/clean`, `GET/POST /api/export/raw`
- New server modules: `server/lib/whisper-transcriber.js`, `server/lib/audio-cleaner.js`, `server/lib/filler-detector.js`, `server/lib/audio-converter.js`
- UI: `web/js/recording-manager.js` (Clean/Raw mode), upload section + transcript display in `web/index.html`
- Fixes: `ad27b23` binary-safe multipart upload (parse body as Buffer), `6d6d9d7` await dynamic fs import in audio-cleaner concat step
- See activeContext for the full architecture diagram

### 2026-05-25: v0.3.0 Release — Version Bump, Self-Hosted Fonts, Header Status Fix
- Bumped `package.json` 0.2.0 → 0.3.0 to reflect Power Move capabilities
- Self-hosted Inter, JetBrains Mono, Space Grotesk as variable woff2 (latin subset, ~100 KB total) — Google Fonts CDN dependency eliminated
- Added `.woff2`/`.woff` MIME types to the static server
- Moved connection-status pill from header center back to header right (it had been centered since the Signal UX redesign in commit `490fdc9`)
- Verified in Chrome via DevTools MCP: zero external font requests, all three families load locally
- Files: `package.json`, `web/fonts/*.woff2` (new), `web/css/studio.css`, `web/index.html`, `server/lib/static-server.js`
- See: [250526_v030_release.md](./250526_v030_release.md)

### 2026-05-25: v0.3.1 — MP3 Fix, Zip Bundle, Configurable LLM, README Rewrite
- Unbroke MP3 export: imported missing `run()` from `audio-cleaner.js` into `server.js`; also fixed a pre-existing multipart parser bug where the last form field (no per-part `Content-Length`) pulled in the trailing boundary marker and silently failed format detection — so MP3 selection had never actually produced an MP3 even before this work
- Added `POST /api/export/zip`: streams all uploaded tracks back as a single archive via `archiver`; mirrors the `handleExportClean` parser pattern, 500 MB cap, preserves filenames
- Wired the studio UI "Download All" button to the new zip endpoint with graceful fallback to per-track downloads on failure
- LLM endpoint is now `LLM_BASE_URL` / `LLM_MODEL` env-driven (default `http://localhost:1234/v1`, `qwen3.5-35b`); removed hardcoded private dev IP from `show-notes-generator.js`
- README features list, AI setup section, Roadmap, and Known Gaps rewritten to match what the code actually ships
- Podcast Tasks 2 and 3 now actually complete end-to-end (previously claimed in v0.3.0 notes but broken at runtime)
- Files: `server/server.js`, `server/lib/audio-cleaner.js`, `server/lib/show-notes-generator.js`, `.env.example`, `web/js/recording-manager.js`, `web/js/main.js`, `package.json`, `README.md`
- Smoke-tested on host node process: /health, /api/export/zip (1/2/0 tracks), /api/export/clean WAV default, /api/export/clean MP3 with full cleaning pipeline
- See: [260525_v031_fixes.md](./260525_v031_fixes.md)

### 2026-05-25: v0.3.2 — Capability Gating + Cloud LLM Support
- Added `GET /api/capabilities` — detects ffmpeg, ffprobe, whisper.cpp binary, Whisper model file, and LLM endpoint configuration; in-memory 60 s cache so it's cheap to call on every page load
- Studio UI now gates Transcribe, Show Notes, and the MP3 format option against their actual prereqs — disabled with an info icon when missing instead of failing on click
- Clicking a gated control opens a modal with the exact install commands for the missing dependency (ffmpeg via brew/apt, whisper.cpp clone+make, Whisper model wget, LLM env var setup)
- Cloud LLM providers supported via `LLM_API_KEY` env var — show-notes generator sends `Authorization: Bearer <key>` when set; works with OpenAI, Together, Groq, and any OpenAI-compatible shim (litellm, anthropic-openai-compat). Local providers (LM Studio, Ollama, llama.cpp server) leave it blank and behave unchanged.
- README "Optional AI Tooling" section rewritten with per-provider `.env` snippets (LM Studio, Ollama, OpenAI, Together AI, Groq, plus Anthropic-via-shim note) and a Feature Gating explainer
- Behavior purely additive — when all prereqs are present, the UI is visually identical to v0.3.1
- Files: `server/lib/capabilities.js` (new), `server/server.js`, `server/lib/show-notes-generator.js`, `web/js/capability-modal.js` (new), `web/js/main.js`, `web/index.html`, `web/css/studio.css`, `.env.example`, `README.md`, `CHANGELOG.md`, `package.json`
- See: [260525_v032_capability_gating.md](./260525_v032_capability_gating.md)
