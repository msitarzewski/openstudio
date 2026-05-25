# 260525_v032_capability_gating

## Objective

Ship v0.3.2 by replacing the fail-loudly UX around optional AI features with a capability-gated UX, and by opening the show-notes pipeline to cloud OpenAI-compatible LLM providers (OpenAI, Together, Groq, etc.) without coupling to any vendor SDK. Users on a vanilla clone should see exactly which dependencies enable which features — and learn how to install them — without ever clicking into a stack trace.

## Outcome

- ✅ `GET /api/capabilities` returns a JSON snapshot of what the runtime can actually do (ffmpeg, ffprobe, whisper.cpp binary, Whisper model, LLM configuration); 60 s in-memory cache
- ✅ Studio UI reads capabilities on load and disables Transcribe / Show Notes / MP3 format option when their prereqs are missing — never invisibly, always with an info icon
- ✅ Clicking a gated control opens a modal explaining the missing dependency with copy-pastable install commands
- ✅ Cloud LLM providers work via `LLM_API_KEY` — show-notes generator sends `Authorization: Bearer <key>` when the env var is set, omits the header when it's blank (preserves local-provider behavior)
- ✅ README "Optional AI Tooling" rewritten — provider examples for LM Studio, Ollama, OpenAI, Together, Groq, and a note on Anthropic-via-shim
- ✅ Behavior is purely additive — when all capabilities are available, the UI looks identical to v0.3.1
- ✅ Version bumped 0.3.1 → 0.3.2

## Files Modified

- `server/lib/capabilities.js` — new module; probes ffmpeg/ffprobe via `which`, checks for the whisper.cpp binary and `models/ggml-medium.bin` on disk, reads `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` from env and reports `configured`/`authenticated` flags. In-memory cache keyed by a 60 s TTL.
- `server/server.js` — wires `GET /api/capabilities` to the new module; returns the cached snapshot as `application/json`.
- `server/lib/show-notes-generator.js` — reads `LLM_API_KEY` from env at module top; both `fetch()` call sites add an `Authorization: Bearer <key>` header when the key is set, omit it when blank. Local providers (LM Studio, Ollama, llama.cpp server) keep working with no env change.
- `web/js/capability-modal.js` — new module; fetches `/api/capabilities` once on load, exposes `isCapable(name)` and `gate(button, capability)`; on a gated click, opens the modal pre-populated with the missing dependency's install instructions.
- `web/index.html` — modal DOM (`<dialog>` element with title slot, body slot, code blocks, close button) added near the end of `<body>`.
- `web/css/studio.css` — modal styling (centered, void background, signal-amber accent border, code-block typography); disabled-state info-icon styling for gated buttons.
- `web/js/main.js` — calls `capability-modal.js` initialization on DOMContentLoaded; gates Transcribe, Show Notes, and the MP3 option in the Export panel against their respective capabilities.
- `.env.example` — `LLM_API_KEY=` added with a comment distinguishing local vs cloud providers (added previously by backend agent; not modified in this doc work).
- `README.md` — "Optional AI Tooling" section rewritten with capability-gating explanation and per-provider `.env` snippets (LM Studio, Ollama, OpenAI, Together, Groq, Anthropic-via-shim).
- `CHANGELOG.md` — v0.3.2 entry added at top; link-reference list updated.
- `package.json` — version 0.3.1 → 0.3.2.

## Patterns Applied

- **Capability detection over feature flags** — capabilities are derived from what the runtime can actually do (binary on PATH? model file on disk? env var set?), not from a config toggle. Eliminates the entire class of bugs where a flag is on but the dependency isn't installed, or where a flag is off but the dependency is present. The endpoint is the single source of truth; the frontend never duplicates the detection logic.
- **Information-rich disabled state** — a gated button is not silent or invisible. It carries an info icon and, on click, opens a modal explaining the missing dependency with exact install commands. Turns a dead-end interaction ("why doesn't this work?") into an onboarding moment ("here's how to enable this"). The user always learns something, never bounces.
- **OpenAI-compatible API as the integration contract** — instead of per-provider SDKs (which proliferate dependencies, drift on version skew, and require code changes for every new provider), the project speaks one HTTP contract — the OpenAI chat completions JSON — that ~90% of LLM hosts implement either natively or via a shim. Adding a new provider is an `.env` edit, not a code change. For the one major holdout (Anthropic Messages API), users run a thin shim (`litellm`, `anthropic-openai-compat`) and the project still doesn't need to know.

## Integration Points

- `server/server.js` routes `GET /api/capabilities` to `capabilities.js`; the cache lives in `capabilities.js` module scope so it's shared across requests within the same process.
- `web/js/capability-modal.js` is loaded by `web/index.html`; its `init()` is called from `web/js/main.js` on DOMContentLoaded before any gateable button is wired.
- `web/js/main.js` gates the Transcribe button (`whisper.cpp` + model), the Show Notes button (LLM `configured`), and the MP3 format option in the Export panel (`ffmpeg`). The MP3 gate falls back to WAV when ffmpeg is absent so export still works.
- `LLM_API_KEY` env var is consumed only in `server/lib/show-notes-generator.js`. Reported back to the frontend via the `capabilities.llm.authenticated` flag (true when a key is set), so the modal can distinguish "no LLM configured" from "LLM configured but no API key" for cloud endpoints.

## Architectural Decisions

- **Decision**: Capability detection runs in the backend, not the frontend.
- **Rationale**: The frontend cannot probe the filesystem for the whisper.cpp binary or the model file, cannot inspect env vars, and cannot run `which`. Putting detection in the backend means one place owns the truth, the frontend just renders it. The 60 s cache makes the endpoint cheap enough to hit on every page load.
- **Trade-off**: One round-trip on page load before AI buttons can be correctly gated. Acceptable — the call returns a few hundred bytes and the cached path is sub-millisecond.

- **Decision**: 60 s cache TTL for capability detection.
- **Rationale**: Operators install whisper.cpp or change env vars rarely. 60 s feels instant after a setup change (refresh and try again) and saves 10+ filesystem and shell calls per page load when multiple users are connected to one studio. Longer TTLs would frustrate operators tweaking their config; shorter TTLs would burn cycles for no real benefit.
- **Trade-off**: After an operator installs a dependency, the change may not surface in the UI for up to 60 s. Acceptable — the dependency story is "install once and forget".

- **Decision**: No live network probe of the LLM endpoint.
- **Rationale**: A cloud LLM probe is slow (full HTTPS roundtrip to OpenAI or Together), potentially expensive (some hosted providers count any auth probe against token budgets), and the show-notes generator already has a graceful fallback for unreachable LLMs. We report `configured` (env vars present) and `authenticated` (API key set when needed), not `reachable`. If the LLM is misconfigured, the user discovers it at the moment they click Show Notes, not on every page load — and the existing fallback path returns transcript-derived show notes anyway.
- **Trade-off**: A misconfigured `LLM_BASE_URL` won't surface until first use. Acceptable — the failure mode is already graceful and the frontend's job is to gate on configuration, not on liveness.

## Verification

- `node -c` clean on every touched JS file
- `GET /api/capabilities` against the host node process:
  - With all deps present → 200, JSON snapshot with all `available: true` flags
  - With `whisper.cpp` binary missing → `whisper.available: false`, `whisper.reason: "binary_missing"`
  - With model file missing → `whisper.model.available: false`
  - With `LLM_BASE_URL` unset → `llm.configured: false`
  - With `LLM_API_KEY` unset against a cloud-style URL → `llm.authenticated: false`
- Cache verified: second call within 60 s skips the filesystem/shell probes (sub-millisecond response)
- Studio UI loaded against a host node process:
  - Buttons gate as expected when capabilities are removed from the response
  - Clicking a gated Transcribe button opens the modal with the whisper.cpp install commands
  - When all capabilities present, the UI is visually identical to v0.3.1

## Related Memory Bank Refs

- `tasks/2026-05/README.md` — May 2026 monthly summary (v0.3.2 entry appended)
- `tasks/2026-05/260525_v031_fixes.md` — v0.3.1 fixes; v0.3.2 builds on the env-driven LLM pattern established there
- `progress.md` — v0.3.2 release block added; Power Move post-production now has end-to-end provider portability
- `activeContext.md` — release status updated to v0.3.2
- `projectRules.md` — capability-detection pattern, information-rich disabled state, OpenAI-compatible HTTP contract as integration boundary
- `techContext.md` — `LLM_API_KEY` env var, `/api/capabilities` endpoint, in-memory 60 s cache
