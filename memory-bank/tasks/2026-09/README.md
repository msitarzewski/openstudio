# Tasks — September 2026

## Tasks Completed

### 2026-09-11/12: Contributions, deploy, and repo hygiene
- **PR #12 merged** — `setup-ai.sh` one-shot AI bootstrap, contributed by an
  outside contributor. Sat unreviewed for four weeks. Also carried a real fix:
  the server's whisper auto-build path still assumed the pre-CMake layout.
- **PR #13** — hardened that script against real-world failure: interrupted
  model downloads were cached as success (and `capabilities.js` detects the
  model with a bare `existsSync`, so the UI would un-gate Transcribe over a
  corrupt file); `.env` was sourced as shell, so a secret containing `$`
  aborted it under `set -u`; `whisper.cpp` was a tracked gitlink that
  `.gitignore` could never apply to. Regression tests verified to fail against
  the pre-fix script.
- **Production deploy** — prod was 8 commits behind; five releases (Power Move,
  v0.3.0–v0.3.2) had never shipped. Now current. See [[reference]] note: prod
  moved hosts and the old deployment notes were wrong.
- **PR #14** — scrubbed local machine details from the public repo (absolute
  developer paths in 8 places) and fixed `deploy/setup.sh`, which appended to a
  shared Caddyfile — both broken (the `>>` redirect runs outside sudo) and
  unsafe on a multi-tenant host. Also fixed a pre-existing break where
  `docker-compose.prod.yml` referenced env vars that existed nowhere.
- **PR #15 (open)** — CI flakiness. See
  [260912_ci_flakiness.md](./260912_ci_flakiness.md). Two test bugs fixed; a
  real product bug uncovered and still open.
