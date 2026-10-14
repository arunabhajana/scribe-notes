import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bell, X } from "lucide-react";
import { ReminderDateTimePicker } from "./ReminderDateTimePicker";
import "./reminderControls.css";

const fields = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
};
export function CaptureReminderPicker({ dueAt, onSave, onClose }: { dueAt?: string; onSave: (dueAt: string | null) => void; onClose: () => void }) {
  const [initial] = useState(() => fields(new Date(dueAt ?? Date.now() + 3600000)));
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { form.current?.focus(); }, []);
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const value = new Date(`${date}T${time}:00`);
    if (!Number.isFinite(value.getTime()) || value.getTime() <= Date.now() || fields(value).date !== date || fields(value).time !== time) { setError("Choose a valid date and time in the future."); return; }
    onSave(value.toISOString()); onClose();
  };
  return <div className="modal-backdrop reminder-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form ref={form} tabIndex={-1} className="folder-modal reminder-modal capture-reminder-modal" role="dialog" aria-modal="true" aria-labelledby="capture-reminder-title" onSubmit={submit} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.ctrlKey && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); submit(); }
      if (event.key === "Tab") {
        const controls = [...(form.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled)') ?? [])];
        const first = controls[0], last = controls[controls.length - 1];
        if (document.activeElement === form.current || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      }
    }}>
      <div className="modal-heading"><h2 id="capture-reminder-title"><Bell size={17} />{dueAt ? "Edit reminder" : "Set reminder"}</h2><button type="button" className="icon-button" aria-label="Close reminder" onClick={onClose}><X size={16} /></button></div>
      <ReminderDateTimePicker date={date} time={time} minDate={fields(new Date()).date} disabled={false} onDateChange={(value) => { setDate(value); setError(""); }} onTimeChange={(value) => { setTime(value); setError(""); }} />
      <p className="reminder-help">Uses your default reminder lead time. Scheduled when you save the note.</p>
      {error && <p className="folder-error" role="alert">{error}</p>}
      <div className="modal-actions">{dueAt && <button type="button" className="cancel-button reminder-remove" onClick={() => { onSave(null); onClose(); }}>Remove</button>}<button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button type="submit" className="new-note-button">{dueAt ? "Save changes" : "Set reminder"}</button></div>
    </form>
  </div>;
}
