import { useEffect, useState } from "react";
import { Flash } from "./features/flash/Flash";
import { SettingsDrawer } from "./features/settings/SettingsDrawer";
import { appConfig } from "./shared/config";

const STORAGE = {
  room: `${appConfig.storagePrefix}:room`,
  role: `${appConfig.storagePrefix}:role`,
  countdown: `${appConfig.storagePrefix}:countdown`,
  flashMs: `${appConfig.storagePrefix}:flashMs`,
};

type Role = "camera" | "lamp";

export function App() {
  const [roomId, setRoomId] = useState(() => localStorage.getItem(STORAGE.room) ?? "default");
  const [role, setRole] = useState<Role>(() => {
    const v = localStorage.getItem(STORAGE.role);
    return v === "camera" || v === "lamp" ? v : "lamp";
  });
  const [countdownMs, setCountdownMs] = useState(() =>
    Number(localStorage.getItem(STORAGE.countdown) ?? "1500"),
  );
  const [flashMs, setFlashMs] = useState(() =>
    Number(localStorage.getItem(STORAGE.flashMs) ?? "180"),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE.room, roomId);
  }, [roomId]);
  useEffect(() => {
    localStorage.setItem(STORAGE.role, role);
  }, [role]);
  useEffect(() => {
    localStorage.setItem(STORAGE.countdown, String(countdownMs));
  }, [countdownMs]);
  useEffect(() => {
    localStorage.setItem(STORAGE.flashMs, String(flashMs));
  }, [flashMs]);

  return (
    <div className="app-root">
      <Flash roomId={roomId} role={role} countdownMs={countdownMs} flashMs={flashMs} />

      <button
        type="button"
        className="settings-fab"
        onClick={() => setSettingsOpen(true)}
        aria-label="Open settings"
      >
        ⚙
      </button>

      <div className="version-badge">
        v{appConfig.version} · {appConfig.commit}
      </div>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        roomId={roomId}
        onRoomChange={setRoomId}
        role={role}
        onRoleChange={setRole}
        countdownMs={countdownMs}
        onCountdownChange={setCountdownMs}
        flashMs={flashMs}
        onFlashMsChange={setFlashMs}
      />
    </div>
  );
}
