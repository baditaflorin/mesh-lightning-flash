import { useEffect, useState } from "react";
import {
  loadSignalingUrl,
  loadTurnTokenUrl,
  resetIceServers,
  saveSignalingUrl,
  saveTurnTokenUrl,
} from "../sync/iceConfig";
import { appConfig } from "../../shared/config";

type Role = "camera" | "lamp";

type Props = {
  open: boolean;
  onClose: () => void;
  roomId: string;
  onRoomChange: (next: string) => void;
  role: Role;
  onRoleChange: (next: Role) => void;
  countdownMs: number;
  onCountdownChange: (next: number) => void;
  flashMs: number;
  onFlashMsChange: (next: number) => void;
};

export function SettingsDrawer(props: Props) {
  const {
    open,
    onClose,
    roomId,
    onRoomChange,
    role,
    onRoleChange,
    countdownMs,
    onCountdownChange,
    flashMs,
    onFlashMsChange,
  } = props;
  const [signaling, setSignaling] = useState(loadSignalingUrl());
  const [tokenUrl, setTokenUrl] = useState(loadTurnTokenUrl());

  useEffect(() => {
    if (open) {
      setSignaling(loadSignalingUrl());
      setTokenUrl(loadTurnTokenUrl());
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-drawer" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <label>
          <span>Room ID</span>
          <input value={roomId} onChange={(e) => onRoomChange(e.target.value)} />
        </label>

        <label>
          <span>Role</span>
          <select value={role} onChange={(e) => onRoleChange(e.target.value as Role)}>
            <option value="camera">📷 camera (triggers flash, shoots photo)</option>
            <option value="lamp">🔦 lamp (strobes flashlight)</option>
          </select>
        </label>

        <label>
          <span>Countdown (ms)</span>
          <input
            type="number"
            min={500}
            max={10000}
            step={100}
            value={countdownMs}
            onChange={(e) => onCountdownChange(Math.max(500, Number(e.target.value) || 1500))}
          />
        </label>

        <label>
          <span>Flash duration (ms)</span>
          <input
            type="number"
            min={20}
            max={2000}
            step={20}
            value={flashMs}
            onChange={(e) => onFlashMsChange(Math.max(20, Number(e.target.value) || 180))}
          />
        </label>

        <hr />

        <h3>Self-hosted infra (advanced)</h3>
        <p className="settings-help">
          Override the default signaling and TURN endpoints. Leave blank to use the built-in
          defaults.
        </p>

        <label>
          <span>Signaling URL</span>
          <input
            value={signaling}
            onChange={(e) => setSignaling(e.target.value)}
            placeholder={appConfig.signalingUrl}
          />
        </label>

        <label>
          <span>TURN credentials URL</span>
          <input
            value={tokenUrl}
            onChange={(e) => setTokenUrl(e.target.value)}
            placeholder={appConfig.turnTokenUrl}
          />
        </label>

        <div className="settings-actions">
          <button
            type="button"
            onClick={() => {
              saveSignalingUrl(signaling);
              saveTurnTokenUrl(tokenUrl);
              onClose();
              location.reload();
            }}
          >
            Save and reload
          </button>
          <button
            type="button"
            onClick={() => {
              saveSignalingUrl("");
              saveTurnTokenUrl("");
              resetIceServers();
              onClose();
              location.reload();
            }}
          >
            Reset to defaults
          </button>
        </div>

        <hr />

        <footer className="settings-footer">
          <a href={appConfig.repositoryUrl} target="_blank" rel="noreferrer">
            source on github
          </a>
          <span>
            v{appConfig.version} · {appConfig.commit}
          </span>
        </footer>
      </div>
    </div>
  );
}
