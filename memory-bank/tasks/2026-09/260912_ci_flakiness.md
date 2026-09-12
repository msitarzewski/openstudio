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

**ROOT CAUSE FOUND AND FIXED — `addTrack` collapsed both return feeds onto one
m-line.** Reproduced live with two real peers in Chrome DevTools.

`addReturnFeedTrack()` used `pc.addTrack()`. Per spec `addTrack` REUSES any
existing compatible transceiver whose sender has no track — including the
`recvonly` transceiver created when the *other* peer added THEIR return feed.
Both feeds then share one m-line, and renegotiating it leaves only one
direction alive. Whoever answers last silently loses their sender.

Captured mid-failure (A never receiving B's feed):

```
A: mid0 sendrecv (mics, fine)
   mid1 dir=sendrecv cur=sendonly  receiver muted   <- collapsed
B: mid0 sendrecv (mics, fine)
   mid1 dir=recvonly cur=recvonly  sender NULL      <- B's feed dropped
A returnFeedCount: 0    B returnFeedCount: 1
```

Fix: `addTransceiver(track, {direction: 'sendonly'})` forces a dedicated
m-line. Same scenario after:

```
A: mid1 sendonly (A->B), mid2 recvonly (B->A)   returnFeedCount: 1
B: mid1 recvonly (A->B), mid2 sendonly (B->A)   returnFeedCount: 1
```

This is why it looked random: only the peer whose sender lost the race was
affected, so one side always worked.

### Ruled out along the way
- **The offer is NOT lost in transit.** Earlier hypothesis from CI logs, now
  disproven: the receiver both dispatches the offer and enters
  `ConnectionManager.handleOffer`. Do not re-investigate signalling.
- `createPeerConnection()` reuses an existing connection (`rtc-manager.js:169`),
  so renegotiation does not tear down peer state.

### STILL FAILING IN CI — narrowed to Node 22, tracked in issue #16

After the transceiver fix the picture sharpened considerably. Node 18 and 20
pass **consistently**; Node 22 fails **consistently** (verified twice on the
same commit). It is no longer random — it is version-specific, which is far
more tractable than what came before.

Playwright pins its own chromium, so the browser is identical across the three
jobs. The difference is host timing: Node 22 is faster, which shifts the
window in which the second peer renegotiates relative to the first peer
finishing setup. That points at a startup race rather than anything in the
media path.

Before the transceiver fix, failures moved unpredictably between Node versions
and between the server and Playwright steps. Now:

| commit | 18 | 20 | 22 |
|---|---|---|---|
| before transceiver fix | fail | pass | fail |
| after, run 1 | pass | pass | fail |
| after, run 2 (rerun) | pass | pass | fail |

### The original framing, kept for context
With the transceiver fix in place and verified locally, `test-return-feed.mjs`
still fails on some CI jobs with the same `count: 0`. In those runs the sender
logs a sent offer and the receiver logs **nothing at all** — not even the
"Offer collision detected" line it would print if it were ignoring the offer.
Since local testing proves offers are delivered, this looks like a separate
race at connection setup: B's renegotiation fires ~0.6 s after connect, while A
is still wiring up its side.

**Unverified suspicion worth checking first:** perfect negotiation has the
impolite peer *ignore* a colliding offer. That is correct for an initial offer,
but for a **renegotiation** it means the polite peer's track is dropped
permanently with no retry — exactly the "silent forever" symptom. An impolite
peer that ignores an offer should trigger its own renegotiation afterwards so
the dropped tracks get re-offered. Not changed, because it could not be
verified.

### Environment note — read before trying again
A local repro needs REAL microphone permission. CDP `Browser.grantPermissions`
is not enough; the prompt only resolved after `select_page` with
`bringToFront: true`, which surfaces an `edge://permission-request-dialog/`
page. Stubbing `getUserMedia` with an AudioContext stream avoids the prompt but
Chrome then withholds host ICE candidates, ICE never leaves `new`, and nothing
is ever sent — a sandbox artifact, not the bug.

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
