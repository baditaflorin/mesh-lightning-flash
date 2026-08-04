import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { useCamera, useFlashlight } from "@baditaflorin/mesh-common";
import { createRoomSync } from "../sync/yjsRoom";
import { createClockSync, type ClockSync } from "../sync/clockSync";
import { maybeFetchTurnCredentials } from "../sync/iceConfig";

type Role = "camera" | "lamp";

type FireEvent = { fireAt: number; cycleId: string };

type Props = {
  roomId: string;
  role: Role;
  onRoleChange: (next: Role) => void;
  countdownMs: number;
  flashMs: number;
};

export function Flash({ roomId, role, onRoleChange, countdownMs, flashMs }: Props) {
  const [armed, setArmed] = useState(false);
  const [pendingFire, setPendingFire] = useState<FireEvent | null>(null);
  const [strobing, setStrobing] = useState(false);
  const [peers, setPeers] = useState(0);
  const [secsToFire, setSecsToFire] = useState<number | null>(null);

  const cam = useCamera({ armed: armed && role === "lamp", facing: "environment" });
  const torch = useFlashlight(cam.stream);
  const torchSupported: boolean | null =
    role !== "lamp" || !armed ? null : cam.error ? false : cam.ready ? torch.supported : null;

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
    if (armed && role === "lamp" && cam.error) {
      console.warn("[flash] camera access failed:", cam.error);
    }
  }, [armed, role, cam.error]);

  useEffect(() => {
    if (!mesh) return undefined;
    const onUpdate = () => {
      const now = mesh.clock.meshNow();
      // Pick the soonest still-live fire event (future, or fired within the
      // last 500ms grace window), not just the first one pushed. Two camera
      // roles can each queue a fire event (ADR 0003 explicitly allows this
      // and claims "the system handles that fine"); picking array order
      // instead of soonest fireAt could make every lamp wait for a later
      // event while an earlier, closer one is silently ignored.
      let next: FireEvent | null = null;
      for (const f of mesh.fires.toArray()) {
        if (f.fireAt > now - 500 && (!next || f.fireAt < next.fireAt)) next = f;
      }
      setPendingFire(next);
    };
    mesh.fires.observe(onUpdate);
    onUpdate();
    // A fire event's 500ms grace window naturally expires on its own, but
    // nothing else mutates the `fires` array at that moment — `observe` only
    // fires on actual array mutations. Without this timer, `pendingFire`
    // (and therefore the disabled FLASH button on the camera role) would
    // stay stuck forever after a single flash, since a session with fewer
    // than 21 total fires never triggers the trim-to-10 delete that would
    // otherwise re-run `onUpdate`. Re-polling periodically clears it.
    const staleCheck = window.setInterval(onUpdate, 250);
    return () => {
      mesh.fires.unobserve(onUpdate);
      window.clearInterval(staleCheck);
    };
  }, [mesh]);

  useEffect(() => {
    if (!mesh) return undefined;
    const i = setInterval(() => setPeers(mesh.clock.peerCount()), 500);
    return () => clearInterval(i);
  }, [mesh]);

  // Live "firing in N s" countdown, measured against the MESH clock (not the
  // local wall clock) so every phone shows the same remaining time and it
  // actually ticks down to zero.
  useEffect(() => {
    if (!pendingFire || !mesh) {
      setSecsToFire(null);
      return undefined;
    }
    const tick = () => {
      const remaining = (pendingFire.fireAt - mesh.clock.meshNow()) / 1000;
      setSecsToFire(remaining > 0 ? remaining : null);
    };
    tick();
    const i = setInterval(tick, 100);
    return () => clearInterval(i);
  }, [pendingFire, mesh]);

  useEffect(() => {
    if (!pendingFire || !mesh) return undefined;
    const delay = pendingFire.fireAt - mesh.clock.meshNow();
    if (delay < -300) return undefined;

    const fire = () => {
      setStrobing(true);
      void torch.setOn(true);
      window.setTimeout(() => {
        setStrobing(false);
        void torch.setOn(false);
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
        <p className="flash-role">This phone is the:</p>
        <div className="flash-role-pick" role="group" aria-label="Pick this phone's role">
          <button
            type="button"
            className={role === "camera" ? "active" : ""}
            aria-pressed={role === "camera"}
            onClick={() => onRoleChange("camera")}
          >
            📷 camera
          </button>
          <button
            type="button"
            className={role === "lamp" ? "active" : ""}
            aria-pressed={role === "lamp"}
            onClick={() => onRoleChange("lamp")}
          >
            🔦 lamp
          </button>
        </div>
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
      {secsToFire !== null && <p className="flash-help">Firing in {secsToFire.toFixed(1)} s…</p>}
    </div>
  );
}

// Silence the unused Y import warning; it's exported by yjsRoom only via type.
export const _y: typeof Y | undefined = undefined;
