export const appConfig = {
  appName: "mesh-lightning-flash",
  storagePrefix: "mesh-lightning-flash",
  description:
    "Peer-to-peer mesh: all phone flashlights strobe in single-millisecond sync to light a group photo from many angles.",
  accentHex: "#ffd24a",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
  repositoryUrl: "https://github.com/baditaflorin/mesh-lightning-flash",
  pagesUrl: "https://baditaflorin.github.io/mesh-lightning-flash/",
  signalingUrl:
    (import.meta.env.VITE_WEBRTC_SIGNALING as string | undefined) ?? "wss://turn.0docker.com/ws",
  turnTokenUrl:
    (import.meta.env.VITE_TURN_TOKEN_URL as string | undefined) ??
    "https://turn.0docker.com/credentials",
  paypalUrl: "https://www.paypal.com/paypalme/florinbadita",
} as const;
