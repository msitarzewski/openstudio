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

**STILL OPEN — return feed never reaches one peer.** With both fixes in place,
CI shows both peers successfully *send* their return feed track, but one peer
never plays the other's.

### Chrome DevTools session, 2026-09-12 — what was ruled OUT

Reproduced two live peers against a local server via the automation browser.

**DISPROVEN: "the renegotiation offer is lost in transit."** This was the
earlier hypothesis, written up from CI logs showing the sender logging a sent
offer and the receiver logging nothing. It is wrong. Sending a
renegotiation-shaped offer straight down the signalling path showed the
receiver dispatching it to the app AND entering `ConnectionManager.handleOffer`:

```
offersDispatchedToApp: [{ from: '4608cc60' }]
handleOfferCalls:      [{ from: '4608cc60' }]
```

The signalling relay delivers renegotiation offers correctly. Whatever the CI
logs showed, it is not a lost message. Do not spend time there again.

**Also ruled out:** `createPeerConnection()` reuses an existing connection
(`rtc-manager.js:169`), so handling a renegotiation offer does not tear down
peer state.

### Two real defects found, neither yet proven to be the cause

1. **The polite peer never actually rolls back.** `connection-manager.js:303`
   logs "We are polite, rolling back our offer" and then does nothing — there
   is no `setLocalDescription({type: 'rollback'})`. It falls through to
   `setRemoteDescription(offer)` and relies on the browser's *implicit*
   rollback. Chrome and Firefox implement that, so it works today, but the log
   claims behaviour the code does not have. Left unchanged: changing untested
   negotiation code was judged riskier than the misleading log.

2. **Gating return feeds on `pc.connectionState === 'connected'` is fragile.**
   `trySendPendingReturnFeed()` requires it. Observed live: a peer sat at
   `connectionState: "new"` / `iceConnectionState: "new"` while
   `signalingState` was `"stable"`, the transceiver was `sendrecv`, and the
   remote mic had been received. Adding a track and renegotiating needs the
   *signalling* path, not a fully connected ICE transport, so this gate is
   stricter than it needs to be.

### Environment limitation — read before trying again

A full two-peer WebRTC session could NOT be completed locally. The automation
browser has no OS-level microphone access, so `getUserMedia` hangs. Stubbing it
with an AudioContext stream avoids the prompt but Chrome then withholds host
ICE candidates, so ICE never leaves `new` and no return feed is ever sent. That
local failure is a sandbox artifact, NOT the CI bug — do not chase it.

To get a real local reproduction, the browser needs genuine mic permission at
the macOS level (System Settings → Privacy → Microphone), or a Chrome launched
with `--use-fake-device-for-media-capture --use-fake-ui-for-media-stream`,
which is what Playwright does in CI.

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
