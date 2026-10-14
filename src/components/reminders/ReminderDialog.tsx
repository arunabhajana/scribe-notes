import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Bell, LoaderCircle, Plus, X } from "lucide-react";
import { formatPresetTime, reminderPresetDate, useReminderShortcuts, type ReminderPreset } from "../../features/settings/reminderShortcuts";
import { ReminderShortcutEditor } from "./ReminderShortcutEditor";
import { ReminderDateTimePicker } from "./ReminderDateTimePicker";
import "./reminderControls.css";
import type { NoteReminder } from "../../features/reminders/reminderTypes";
import { formatReminderTime } from "../../features/reminders/reminderTypes";

function localFields(value: Date) {
  const pad = (number: number) => String(number).padStart(2, "0");
  return { date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`, time: `${pad(value.getHours())}:${pad(value.getMinutes())}` };
}

export function ReminderDialog({ reminder, defaultLead, pending, offline, cloudError, saveHint, onSave, onClose }: {
  reminder?: NoteReminder;
  defaultLead: number;
  pending: boolean;
  offline: boolean;
  cloudError: string | null;
  saveHint?: string;
  onSave: (dueAt: string | null, leadMinutes: number) => Promise<string | null>;
  onClose: () => void;
}) {
  const { presets, defaultPreset, add } = useReminderShortcuts();
  const [initial] = useState(() => localFields(reminder?.dueAt ? new Date(reminder.dueAt) : reminderPresetDate(defaultPreset)));
  const [today] = useState(() => localFields(new Date()).date);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [lead, setLead] = useState(reminder?.dueAt ? reminder.leadMinutes : defaultLead);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingShortcut, setAddingShortcut] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(reminder?.dueAt ? null : defaultPreset.id);
  const addShortcutTrigger = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    form.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  const quickTime = useCallback((preset: ReminderPreset) => {
    const value = reminderPresetDate(preset);
    const fields = localFields(value);
    setDate(fields.date); setTime(fields.time); setError(null);
    setSelectedPreset(preset.id === "custom" ? null : preset.id);
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const value = new Date(`${date}T${time}:00`);
    if (!date || !time || !Number.isFinite(value.getTime()) || value.getTime() <= Date.now()) {
      setError("Choose a date and time in the future."); return;
    }
    const fields = localFields(value);
    if (fields.date !== date || fields.time !== time) { setError("That local time is unavailable. Choose another time."); return; }
    setBusy(true);
    const result = await onSave(value.toISOString(), lead);
    setBusy(false);
    if (result) setError(result); else onClose();
  }
  async function remove() {
    setBusy(true);
    const result = await onSave(null, 0);
    setBusy(false);
    if (result) setError(result); else onClose();
  }

  return <div className="modal-backdrop reminder-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <form ref={form} tabIndex={-1} className="folder-modal reminder-modal" role="dialog" aria-modal="true" aria-labelledby="reminder-dialog-title" onSubmit={(event) => { void submit(event); }} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }
      if (event.ctrlKey && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); if (!busy) form.current?.requestSubmit(); }
      if (event.key === "Tab") {
        const controls = form.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled)');
        if (!controls?.length) return;
        const first = controls[0]; const last = controls[controls.length - 1];
        if (document.activeElement === form.current) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <div className="modal-heading">
        <div><h2 id="reminder-dialog-title"><Bell size={18} />{reminder?.dueAt ? "Edit reminder" : "Set reminder"}</h2></div>
        <button type="button" className="icon-button" aria-label="Close reminder dialog" disabled={busy} onClick={onClose}><X size={17} /></button>
      </div>
      {reminder?.dueAt && <p className="reminder-current">Scheduled for {formatReminderTime(reminder.dueAt)}{pending ? " · Saved locally, awaiting sync" : ""}</p>}
      <ReminderDateTimePicker date={date} time={time} minDate={today} disabled={busy}
        onDateChange={(value) => { setDate(value); setSelectedPreset(null); setError(null); }}
        onTimeChange={(value) => { setTime(value); setSelectedPreset(null); setError(null); }} />
      <p className="reminder-help">Times use this device’s local time zone.</p>
      <fieldset className="reminder-shortcuts" disabled={busy}><legend>Remind me in</legend>
        <div className="reminder-quick-times">
          {presets.map((preset) => <button type="button" key={preset.id} aria-pressed={selectedPreset === preset.id}
            data-tooltip={preset.time !== undefined ? `At ${formatPresetTime(preset.time)}, today or tomorrow` : undefined} onClick={() => quickTime(preset)}>{preset.label}</button>)}
          <button ref={addShortcutTrigger} type="button" className="reminder-shortcut-add" aria-expanded={addingShortcut}
            aria-pressed={addingShortcut || selectedPreset === null}
            onClick={() => setAddingShortcut((value) => !value)}><Plus size={13} />Custom</button>
        </div>
        {addingShortcut && <ReminderShortcutEditor onCancel={() => { setAddingShortcut(false); addShortcutTrigger.current?.focus(); }} onSave={(input) => {
          const result = add(input);
          if (!result) {
            quickTime({ ...input, id: "custom" });
            setAddingShortcut(false); addShortcutTrigger.current?.focus();
          }
          return result;
        }} />}
      </fieldset>
      <fieldset className="reminder-lead" disabled={busy}><legend>Also remind me before</legend><div>
        {[0, 5, 10, 15, 30, 60].map((minutes) => <button key={minutes} type="button" aria-pressed={lead === minutes} onClick={() => setLead(minutes)}>{minutes === 0 ? "At the time" : `${minutes}m before`}</button>)}
      </div></fieldset>
      <p className="reminder-help">{saveHint ?? (offline ? "Saves on this device and syncs when you go online." : "Saves on this device immediately, then syncs to your account.")}</p>
      {cloudError && <p className="reminder-cloud-issue" role="status">{cloudError}</p>}
      {error && <p className="folder-error" role="alert">{error}</p>}
      <div className="modal-actions reminder-dialog-actions">
        {reminder?.dueAt && <button className="cancel-button reminder-remove" type="button" disabled={busy} onClick={() => { void remove(); }}>Remove reminder</button>}
        <button className="cancel-button" type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="new-note-button" type="submit" disabled={busy}>{busy && <LoaderCircle size={14} className="loading-spinner" />}{reminder?.dueAt ? "Save changes" : "Set reminder"}</button>
      </div>
    </form>
  </div>;
}
