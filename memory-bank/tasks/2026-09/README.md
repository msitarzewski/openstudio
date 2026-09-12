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
- **PR #15 (merged)** — CI flakiness, and it was never really flakiness. See
  [260912_ci_flakiness.md](./260912_ci_flakiness.md). Four separate bugs: shared
  peer IDs in the signalling tests; a missed `peer-joined` in the rooms tests; a
  transceiver collapse that silently dropped return feeds (a real user-facing
  bug — a participant could hear silence for a whole session); and a `ci.yml`
  line that ran the return-feed test three times and accepted any pass, which
  hid all of it. `main` is now green on Node 18, 20 and 22. One residual
  Node-22-only failure is handed to the community as issue #16.

### 2026-09-12: Repo sweep — three latent breakages
- **`deploy/setup.sh` could never run.** PR #14 changed it to `npm ci`, but
  `package-lock.json` is gitignored (`.gitignore:6`) and no lockfile is tracked,
  so a fresh clone died with `npm error code EUSAGE`. Reverted to
  `npm install --omit=dev`. **Open question for the project:** an application
  normally *should* commit its lockfiles for reproducible installs; the ignore
  rule is a library convention. Left as-is rather than reversing a deliberate
  choice.
- **Four env vars were undocumented** in `.env.example` — `PORT`,
  `ALLOWED_ORIGINS`, `ICECAST_MOUNT`, `ICECAST_USER`. The important one is
  `ALLOWED_ORIGINS`: when unset or empty **every origin is permitted**
  (`server/server.js:53`), which is fine locally and wrong in production. All
  four now documented with their real defaults.
- **Docs still told people to init a submodule that no longer exists.** PR #13
  untracked the `whisper.cpp` gitlink, but `memory-bank/README.md`,
  `techContext.md`, `progress.md`, `activeContext.md` and `systemPatterns.md`
  still instructed `git submodule update --init`, which silently does nothing.
  All corrected to point at `./setup-ai.sh`. The 2026-05 task log keeps the old
  wording deliberately — it is a historical record.

### 2026-09-12: Blocking alert() on signalling drops
`main.js` raised a modal on every WebSocket error, but `signaling-client.js`
already reconnects with exponential backoff and never gives up. So the dialog
interrupted the user over a self-healing condition, `alert()` blocked the event
loop that drives the reconnect, and one outage could queue several dialogs.
Now sets the status pill to "Reconnecting…" instead.
