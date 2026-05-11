---
status: accepted
date: 2026-05-11
---

# 0002 — Clock sync + torch trigger

## Context

The app's value depends on every lamp phone igniting its flash at the same wall-clock instant. There are two latency sources to manage:

1. **Mesh clock disagreement** between phones (system clock drift).
2. **Driver latency** on `MediaStreamTrack.applyConstraints({ torch: true })`.

The clock-sync part is solved cleanly by the median-offset algorithm shared with `mesh-firefly-walk`. The torch part is not — see caveats below.

## Decision

- Reuse the **median-offset clock sync** from `src/features/sync/clockSync.ts` (~10–30 ms steady state).
- Schedule the fire by writing `{ fireAt: meshNow + countdownMs }` to a shared `Y.Array`. Every lamp computes its own local `setTimeout(fire, fireAt - meshNow())`.
- Default `countdownMs = 1500`. Long enough for the slowest peer's awareness round to deliver the event with ≥1 s of slack.
- At fire time, each lamp:
  - flips the screen to `#fff` (CSS class toggle — completes within the next animation frame, ~16 ms).
  - calls `track.applyConstraints({ advanced: [{ torch: true }] })` (best-effort, may fail or be slow).
  - flips both off after `flashMs`.

The **screen flash is the synchronization-critical path.** The **torch is bonus brightness** when it works.

## Consequences

- Across two Android phones in steady state we observe screen-flash divergence well under 50 ms.
- Torch latency varies widely. We do not block on torch — we set it asynchronously.
- iOS Safari does not expose the torch capability. We detect this via `track.getCapabilities?.().torch` and surface "torch not supported" in the lamp HUD. The screen flash still works.
- Camera permission is requested on lamp-arm because torch requires an active camera track. We pick `facingMode: "environment"` (rear camera, where the LED is).

## Alternatives considered

- **NTP-grade clock sync.** Rejected — overkill, see ADR 0002 in `mesh-firefly-walk`.
- **Designated leader broadcasting a "fire now" event.** Rejected — adds 1× RTT of slop equal to whatever signaling latency is. Pre-scheduling against a future mesh-time instant is tighter.
- **WebUSB / WebHID for torch.** Rejected — not portable, and the existing track-constraints path works on Chrome Android.
