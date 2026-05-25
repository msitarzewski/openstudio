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
