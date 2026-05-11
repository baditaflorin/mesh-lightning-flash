# mesh-lightning-flash

[![Live](https://img.shields.io/badge/live-baditaflorin.github.io%2Fmesh--lightning--flash-FFD24A?style=flat-square)](https://baditaflorin.github.io/mesh-lightning-flash/)
[![Version](https://img.shields.io/github/package-json/v/baditaflorin/mesh-lightning-flash?style=flat-square&color=8a7a4a)](https://github.com/baditaflorin/mesh-lightning-flash/blob/main/package.json)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![No backend](https://img.shields.io/badge/backend-none-1a160a?style=flat-square)](docs/adr/0001-deployment-mode.md)

> Peer-to-peer mesh: all phone flashlights strobe in single-millisecond sync to light a group photo from many angles at once.

**Live:** https://baditaflorin.github.io/mesh-lightning-flash/

You're at a viewpoint at night. You want a group photo with decent lighting and you have six phones between you. Open the link on every phone, pick one as the **camera** and the rest as **lamps**, point the lamps' flashlights at the subject, and tap **FLASH** on the camera. Every lamp strobes simultaneously; you take the shot during the strobe.

## How it works

1. All phones join a Yjs room over y-webrtc.
2. Clock-sync (median offset via Yjs awareness) settles the mesh clock to ~10–30 ms.
3. The camera writes a `{ fireAt: meshNow + countdown }` event into a shared `Y.Array`.
4. Every lamp's `setTimeout` is scheduled relative to its own `meshNow → fireAt`, so they all converge on the same wall-clock instant.
5. At that instant, each lamp:
   - flips its screen full white (instant, no driver latency)
   - calls `track.applyConstraints({ advanced: [{ torch: true }] })` (best-effort)
   - flips both off after `flashMs`.

## Honest caveats about torch sync

- **iOS Safari does not expose the torch API at all.** iPhones flash their _screen_ bright white, but the actual flashlight LED stays off. Android Chrome works.
- The `applyConstraints({ torch })` call has 30–250 ms of variable latency depending on the camera driver. The _screen_ flash is exact; the LED is best-effort.
- **Verdict.** On a mixed-OS group, treat the screens as soft fill lights and the Android phones' torches as bright key lights. The 6-angle aggregate is still way brighter than any single phone's flash.

## Privacy threat model

See [docs/privacy.md](docs/privacy.md). The wire payload is `{ fireAt, cycleId }` timestamps. No identity, no photo, nothing sensitive. Photos stay on the camera phone.

## Architecture

- **Mode A** — pure GitHub Pages. ([ADR 0001](docs/adr/0001-deployment-mode.md))
- **WebRTC transport** — Yjs + y-webrtc, on top of [self-hosted infra](#self-hosted-infrastructure). Overridable in Settings.
- **No GitHub Actions.** Local pre-push hook gates formatting, typecheck, and a build smoke test.

## Run it locally

```bash
git clone https://github.com/baditaflorin/mesh-lightning-flash.git
cd mesh-lightning-flash
npm install
npm run dev
```

## Self-hosted infrastructure

| Repo                                                                   | Endpoint                               | Role                        |
| ---------------------------------------------------------------------- | -------------------------------------- | --------------------------- |
| [signaling-server](https://github.com/baditaflorin/signaling-server)   | `wss://turn.0docker.com/ws`            | y-webrtc protocol fan-out   |
| [turn-token-server](https://github.com/baditaflorin/turn-token-server) | `https://turn.0docker.com/credentials` | HMAC TURN creds, 1-hour TTL |
| [coturn-hetzner](https://github.com/baditaflorin/coturn-hetzner)       | `turn:turn.0docker.com:3479`           | TURN relay                  |

Override from the in-app Settings drawer.

## ADRs

- [0001 — Deployment mode](docs/adr/0001-deployment-mode.md)
- [0002 — Clock sync + torch trigger](docs/adr/0002-clock-sync-torch.md)
- [0003 — Camera role and shutter timing](docs/adr/0003-camera-role.md)
- [0010 — GitHub Pages publishing](docs/adr/0010-pages-publishing.md)

## License

[MIT](LICENSE) © 2026 Florin Badita
