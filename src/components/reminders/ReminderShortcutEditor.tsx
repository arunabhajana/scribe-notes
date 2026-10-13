import { useId, useState } from "react";
import { formatPresetTime, isPresetTime, shortcutDuration, type ReminderShortcutInput } from "../../features/settings/reminderShortcuts";
import { ReminderDateTimePicker } from "./ReminderDateTimePicker";

const units = [{ label: "Minutes", multiplier: 1 }, { label: "Hours", multiplier: 60 }, { label: "Days", multiplier: 1440 }] as const;
export function ReminderShortcutEditor({ initial, onSave, onCancel }: {
  initial?: ReminderShortcutInput;
  onSave: (input: ReminderShortcutInput) => string | null;
  onCancel: () => void;
}) {
  const initialUnit = initial?.minutes && initial.minutes % 1440 === 0 ? 1440 : initial?.minutes && initial.minutes % 60 === 0 ? 60 : 1;
  const [label, setLabel] = useState(initial?.label ?? "");
  const [amount, setAmount] = useState(String((initial?.minutes ?? 15) / initialUnit));
  const [unit, setUnit] = useState<number>(initialUnit);
  const [mode, setMode] = useState<"duration" | "time">(initial?.time !== undefined ? "time" : "duration");
  const [time, setTime] = useState(initial?.time ?? "09:00");
  const [today] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const minutes = Number(amount) * unit;
  const valid = /^\d+$/.test(amount) && Number.isInteger(minutes) && minutes >= 1 && minutes <= 525600;
  const suggestedName = mode === "time" ? formatPresetTime(time) : valid ? shortcutDuration(minutes) : "e.g. Coffee break";
  function save() {
    if (mode === "duration" && !valid) { setError("Choose a duration between 1 minute and 365 days."); return; }
    if (mode === "time" && !isPresetTime(time)) { setError("Choose a valid time."); return; }
    const name = label.trim() || suggestedName;
    const result = onSave(mode === "time" ? { label: name, time } : { label: name, minutes });
    if (result) setError(result);
  }
  return <div className="reminder-shortcut-editor" onKeyDown={(event) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); save(); }
  }}>
    <label htmlFor={`${id}-name`}>Preset name <span>Optional</span></label>
    <input id={`${id}-name`} autoFocus value={label} maxLength={24} placeholder={suggestedName}
      onChange={(event) => { setLabel(event.target.value); setError(null); }} />
    <div className="reminder-shortcut-units reminder-preset-mode" role="group" aria-label="Preset timing">
      <button type="button" aria-pressed={mode === "duration"} onClick={() => { setMode("duration"); setError(null); }}>After a delay</button>
      <button type="button" aria-pressed={mode === "time"} onClick={() => { setMode("time"); setError(null); }}>At a time</button>
    </div>
    {mode === "duration" ? <><label htmlFor={`${id}-duration`}>Remind me in</label>
    <div className="reminder-shortcut-duration">
      <input id={`${id}-duration`} type="text" inputMode="numeric" value={amount} maxLength={6} aria-label="Preset duration"
        onChange={(event) => { setAmount(event.target.value.replace(/\D/g, "")); setError(null); }} />
      <div className="reminder-shortcut-units" role="group" aria-label="Duration unit">
        {units.map((item) => <button key={item.label} type="button" aria-pressed={unit === item.multiplier} onClick={() => { setUnit(item.multiplier); setError(null); }}>{item.label}</button>)}
      </div>
    </div></> : <>
      <ReminderDateTimePicker timeOnly date={today} minDate={today} time={time} disabled={false} onDateChange={() => undefined} onTimeChange={(value) => { setTime(value); setError(null); }} />
      <p className="reminder-help">Uses the next occurrence of this local time: today if it’s ahead, otherwise tomorrow.</p>
    </>}
    {error && <p className="reminder-shortcut-error" role="alert">{error}</p>}
    <div className="reminder-shortcut-editor-actions">
      <button className="cancel-button" type="button" onClick={onCancel}>Cancel</button>
      <button className="new-note-button" type="button" onClick={save}>{initial ? "Save changes" : "Add preset"}</button>
    </div>
  </div>;
}
