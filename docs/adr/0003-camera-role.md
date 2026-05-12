---
status: accepted
date: 2026-05-11
---

# 0003 — Camera role and shutter timing

## Context

The strobe is useful only if a camera fires during it. We need a defined role-split between "the phone that takes the picture" and "the phones that light the scene."

## Decision

- **Two roles, user-selected in Settings:** `camera` or `lamp`. Default `lamp` (most phones).
- Exactly one camera per session is the user's responsibility — we don't enforce uniqueness. Two cameras pressing FLASH at once queue two fire events; the system handles that fine.
- The camera role shows a large **FLASH** button and a white-screen overlay. The user takes the photo with their native camera app during the strobe (see "Why not in-browser shutter" below).
- After tapping FLASH, the camera's own screen also goes white at `fireAt`, giving the photographer a visual "shoot now" cue that's synchronized with the lamps.

## Why not in-browser shutter

A web-based `ImageCapture.takePhoto()` runs on a `MediaStreamTrack`. To use it the camera role would need to hold a `getUserMedia` track active. The captured photo would also be a low-res JPEG without the native camera app's denoising, HDR, or RAW pipeline. The native camera app gives a vastly better image.

So the role-split is: the **browser** synchronizes the strobe across phones; the **native camera app** takes the photo. The user pre-opens their camera app, then keeps the browser visible until the screen flashes, then quickly swaps. With practice, you nail the shot inside `flashMs` (default 180 ms — plenty for a person not actively running).

We surface the trade-off in onboarding copy.

## Consequences

- Zero implementation cost on shutter — no `ImageCapture`, no canvas snapshot, no file download path.
- The camera role still benefits from clock sync because its screen-flash timing tells the user _when to press_.
- A future variant could add in-browser `ImageCapture` for the "single phone selfie with mesh lighting" use case. Out of scope for v1.

## Alternatives considered

- **Auto-shoot via `ImageCapture.takePhoto()`.** Rejected as above.
- **Multi-shutter** — every phone takes a photo simultaneously. Rejected — see in-browser quality limitations. A future variant might offer this for "10 angles of one moment" panorama-style use.
