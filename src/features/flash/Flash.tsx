import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { createRoomSync } from "../sync/yjsRoom";
import { createClockSync, type ClockSync } from "../sync/clockSync";
import { maybeFetchTurnCredentials } from "../sync/iceConfig";

type Role = "camera" | "lamp";

type FireEvent = { fireAt: number; cycleId: string };

type Props = {
  roomId: string;
  role: Role;
  countdownMs: number;
  flashMs: number;
};

export function Flash({ roomId, role, countdownMs, flashMs }: Props) {
  const [armed, setArmed] = useState(false);
  const [pendingFire, setPendingFire] = useState<FireEvent | null>(null);
  const [strobing, setStrobing] = useState(false);
  const [peers, setPeers] = useState(0);
  const [torchSupported, setTorchSupported] = useState<boolean | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const mesh = useMemo(() => {
    if (!armed) return null;
    const room = createRoomSync(roomId);
    const clock = createClockSync(room.provider);
    const fires = room.doc.getArray<FireEvent>("fires");
    return { room, clock, fires };
  }, [armed, roomId]);

  useEffect(() => {
    if (!armed) return;
    void maybeFetchTurnCredentials();
  }, [armed]);

  useEffect(() => {
    if (!armed || role !== "lamp") return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const [track] = stream.getVideoTracks();
        if (!track) {
          setTorchSupported(false);
          return;
        }
        trackRef.current = track;
        const caps = track.getCapabilities?.() as
          | (MediaTrackCapabilities & { torch?: boolean })
          | undefined;
        setTorchSupported(Boolean(caps?.torch));
      } catch (err) {
        console.warn("[flash] camera access failed:", err);
        setTorchSupported(false);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      trackRef.current = null;
    };
  }, [armed, role]);

  useEffect(() => {
    if (!mesh) return undefined;
    const onUpdate = () => {
      const all = mesh.fires.toArray();
      const next = all.find((f) => f.fireAt > mesh.clock.meshNow() - 500);
      setPendingFire(next ?? null);
    };
    mesh.fires.observe(onUpdate);
    onUpdate();
    return () => mesh.fires.unobserve(onUpdate);
  }, [mesh]);

  useEffect(() => {
    if (!mesh) return undefined;
    const i = setInterval(() => setPeers(mesh.clock.peerCount()), 500);
    return () => clearInterval(i);
  }, [mesh]);

  useEffect(() => {
    if (!pendingFire || !mesh) return undefined;
    const delay = pendingFire.fireAt - mesh.clock.meshNow();
    if (delay < -300) return undefined;

    const fire = () => {
      setStrobing(true);
      void setTorch(trackRef.current, true);
      window.setTimeout(() => {
        setStrobing(false);
        void setTorch(trackRef.current, false);
      }, flashMs);
    };

    if (delay <= 0) {
      fire();
      return undefined;
    }
    const t = window.setTimeout(fire, delay);
    return () => window.clearTimeout(t);
  }, [pendingFire, mesh, flashMs]);

  const triggerFlash = () => {
    if (!mesh) return;
    const cycleId = crypto.randomUUID();
    const fireAt = mesh.clock.meshNow() + countdownMs;
    mesh.fires.push([{ fireAt, cycleId }]);
    // Capture photo on camera role at the same instant
    if (role === "camera") {
      // The camera role just times its own shutter; users tap-shoot manually
      // when they see their own screen flash white.
    }
    // Trim old fires
    if (mesh.fires.length > 20) {
      mesh.room.doc.transact(() => {
        mesh.fires.delete(0, mesh.fires.length - 10);
      });
    }
  };

  if (!armed) {
    return (
      <div className="flash-arm">
        <h1>mesh-lightning-flash</h1>
        <p>
          Designate one phone as the <strong>camera</strong>, the others as <strong>lamps</strong>.
          Lamps point their flashlights at the subject. Tap <em>FLASH</em> on the camera and every
          lamp strobes simultaneously.
        </p>
        <p className="flash-role">
          This phone: <strong>{role === "camera" ? "📷 camera" : "🔦 lamp"}</strong>
        </p>
        <button type="button" className="flash-arm-button" onClick={() => setArmed(true)}>
          {role === "camera" ? "Arm camera" : "Arm lamp"}
        </button>
      </div>
    );
  }

  if (role === "camera") {
    return (
      <div className="flash-stage">
        <div className={`flash-overlay ${strobing ? "on" : ""}`} />
        <div className="flash-hud">
          {peers + 1} phones in room · {peers} lamps ready
        </div>
        <button
          type="button"
          className="flash-trigger"
          onClick={triggerFlash}
          disabled={!!pendingFire}
        >
          {pendingFire ? "Firing…" : "FLASH"}
        </button>
        <p className="flash-help">
          When the white screen fires, take your photo. All lamps strobe at the same instant (±10–30
          ms via clock-sync; torch latency is best-effort).
        </p>
      </div>
    );
  }

  return (
    <div className="flash-stage">
      <div className={`flash-overlay ${strobing ? "on" : ""}`} />
      <div className="flash-hud">
        {peers + 1} phones · torch{" "}
        {torchSupported === null ? "?" : torchSupported ? "supported" : "not supported"}
      </div>
      {torchSupported === false && (
        <p className="flash-help">
          This browser/device does not expose the torch API (iOS Safari does not). The screen will
          still flash bright white — point it at the subject as a softer fill light.
        </p>
      )}
      {pendingFire && (
        <p className="flash-help">
          Firing in {Math.max(0, Math.round((pendingFire.fireAt - (Date.now() + 0)) / 100) / 10)} s
        </p>
      )}
    </div>
  );
}

async function setTorch(track: MediaStreamTrack | null, on: boolean): Promise<void> {
  if (!track) return;
  try {
    await track.applyConstraints({
      advanced: [{ torch: on } as unknown as MediaTrackConstraintSet],
    });
  } catch {
    // Torch unsupported — visible screen flash still happens.
  }
}

// Silence the unused Y import warning; it's exported by yjsRoom only via type.
export const _y: typeof Y | undefined = undefined;
