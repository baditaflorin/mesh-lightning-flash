type Role = "camera" | "lamp";

type Props = {
  role: Role;
  onRoleChange: (next: Role) => void;
  countdownMs: number;
  onCountdownChange: (next: number) => void;
  flashMs: number;
  onFlashMsChange: (next: number) => void;
};

export function SettingsExtras({
  role,
  onRoleChange,
  countdownMs,
  onCountdownChange,
  flashMs,
  onFlashMsChange,
}: Props) {
  return (
    <>
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
    </>
  );
}
