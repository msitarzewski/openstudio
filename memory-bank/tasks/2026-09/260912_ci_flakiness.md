# 260912_ci-flakiness

## Objective
Stop CI failing intermittently on every push. Three distinct problems were
hiding behind one symptom.

## Outcome
- ✅ Signaling test flake — root-caused and fixed
- ✅ Rooms test teardown — hardened (not a confirmed root cause)
- ❌ Return-feed failure — **NOT a test flake. A real product bug, still open.**

## 1. Shared peer IDs in `server/test-signaling.js` (FIXED)

Tests 3–8 registered the same two hardcoded UUIDs, and teardown was
`ws.close()` — fire-and-forget, which only *starts* the closing handshake.
When the next test's `register` beat the previous socket's cleanup, the server
correctly answered `already registered` and the test timed out waiting for
`registered`.

The window is too narrow to reproduce on a fast machine. The mechanism was
proven deterministically by holding the window open explicitly:

```
SHARED id, teardown not yet processed:  next test -> error (already registered)
UNIQUE ids, same window:                next test -> registered
```

Fix: every test mints IDs via `randomUUID()` (2000/2000 pass the server's
`UUID_V4_REGEX`); teardown awaits `CLOSED`. 15/15 consecutive clean runs.
**The server was never at fault** — duplicate rejection is desired, test 2
still asserts it.

## 2. Return feeds — two real bugs fixed, one still open

**Fixed — one-shot mix-minus check.** After the stagger delay (500 ms polite /
2500 ms impolite) `main.js` checked **once** for the peer's mix-minus stream;
if it was not ready at that instant it logged a warning and gave up
permanently. Now polls for 10 s past the delay.

**Fixed — edge-triggered retry that had already fired.**
`trySendPendingReturnFeed()` bails when the RTCPeerConnection is not yet
`connected`, relying on `connection-state-changed` to retry. But the
connection routinely reaches `connected` *before* the mix-minus bus is ready,
so the edge had already passed and nothing fired again — the feed stayed
pending forever and that peer heard silence. Now polls for up to 15 s.

**STILL OPEN — a renegotiation offer never arrives.** With both fixes in
place, CI logs show both peers successfully *send* their return feed track,
but one peer never *receives* the other's:

```
17:23:14.18  B: return feed track added, negotiation offer sent to A
17:23:14.18–17:23:16.69   A logs NOTHING — the offer never arrives
17:23:16.69  A: sends its own offer; B receives it fine
17:24:10     A: return feed count still 0 -> FAIL
```

Not glare — A was not making an offer when B's was sent. The offer is simply
lost or silently dropped. **User-facing**: a participant can permanently hear
silence. Needs a focused session on the perfect-negotiation implementation in
`web/js/connection-manager.js` / `rtc-manager.js`.

## 3. CI was masking it (FIXED)

`ci.yml` ran `test-return-feed.mjs || test-return-feed.mjs || test-return-feed.mjs`
— three attempts, any pass (added by PR #4, "stabilize flaky return-feed test
in CI"). That hid the bug above and made every red X ambiguous, which is a
large part of why PR #12 sat four weeks with nobody trusting its checks. Now
runs once.

With the mask off the true failure rate is visible: roughly 2 of 3 jobs.
`0.67³ ≈ 30%` matches how often CI was red before.

## Files Modified
- `server/test-signaling.js` — unique IDs per test, awaited teardown
- `server/test-rooms.js` — awaited teardown (hygiene)
- `web/js/main.js` — mix-minus polling, self-healing pending return feeds
- `.github/workflows/ci.yml` — retry mask removed

## Status
PR #15 open, **intentionally not merged** — CI is honestly red on the
outstanding product bug. Merging requires either fixing the renegotiation bug
or a deliberate decision to restore the mask.

## Notes
- CI had been red on `main` for 5 consecutive pushes since v0.3.2 (2026-05-25)
- The Playwright browser build for this repo would not finish installing
  locally, so the return-feed path is CI-verified only
