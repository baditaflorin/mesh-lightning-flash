# Privacy threat model — mesh-lightning-flash

## What other peers in the same room can see

- `Date.now()` timestamps (clock sync).
- `{ fireAt, cycleId }` events when the camera triggers a flash.
- Yjs awareness `clientID` — a per-session random integer, not tied to anything.

That's the entire payload on the wire.

## What the camera can see

The lamp role requests `getUserMedia({ video: { facingMode: "environment" } })` to acquire a `MediaStreamTrack` so it can toggle `torch`. We **do not** render the video frame, **do not** keep it in memory beyond what the browser holds for the track, and **do not** send it anywhere. The track is stopped when the lamp screen is closed.

Browsers display the standard "camera active" indicator while the track is held.

The camera role does not call `getUserMedia` at all — it uses the user's native camera app.

## What the signaling server sees

The y-webrtc protocol carries:
- the room name (`mesh-lightning-flash:<roomId>`).
- encrypted SDP offers/answers.

It does not see fire events.

## What the TURN server sees

Encrypted DTLS/SRTP bytes when peers can't connect directly. Same as every TURN deployment.

## What stays local

- Photos. Photos never enter the browser at all — they are taken by the user's native camera app and stored wherever that app stores them.
- Settings.
