import { useState } from "react";
import { Clock3, Pencil, Plus, Trash2 } from "lucide-react";
import { formatPresetTime, shortcutDuration, useReminderShortcuts } from "../../features/settings/reminderShortcuts";
import { ReminderShortcutEditor } from "../reminders/ReminderShortcutEditor";
import "../reminders/reminderControls.css";

export function ReminderShortcutSettings() {
  const { shortcuts, presets, defaultId, setDefault, add, update, remove } = useReminderShortcuts();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = shortcuts.find((item) => item.id === editingId);
  function close() { setAdding(false); setEditingId(null); }
  return <div className="reminder-shortcut-settings">
    <div className="reminder-preset-default">
      <strong>Default reminder</strong>
      <p className="reminder-help">Used when you choose the quick reminder action in a note’s context menu.</p>
      <div className="reminder-preset-options" role="group" aria-label="Default reminder preset">
        {presets.map((preset) => <button key={preset.id} type="button" aria-pressed={defaultId === preset.id}
          data-tooltip={preset.time !== undefined ? `At ${formatPresetTime(preset.time)}, today or tomorrow` : `Remind in ${shortcutDuration(preset.minutes)}`}
          onClick={() => setError(setDefault(preset.id))}>{preset.label}</button>)}
      </div>
    </div>
    <h3 className="reminder-custom-presets-title">Custom presets</h3>
    {shortcuts.length === 0 && <p className="reminder-help">Create a preset for a reminder time you use often.</p>}
    {shortcuts.map((shortcut) => <div className="reminder-shortcut-setting-row" key={shortcut.id}>
      <Clock3 size={17} /><div><strong>{shortcut.label}</strong><span>{shortcut.time !== undefined ? `At ${formatPresetTime(shortcut.time)} · today or tomorrow` : `${shortcutDuration(shortcut.minutes)} from now`}</span></div>
      <button className="icon-button" type="button" aria-label={`Edit ${shortcut.label} preset`} data-tooltip="Edit preset" onClick={() => { setEditingId(shortcut.id); setAdding(false); setError(null); }}><Pencil size={15} /></button>
      <button className="icon-button reminder-shortcut-delete" type="button" aria-label={`Remove ${shortcut.label} preset`} data-tooltip="Remove preset" onClick={() => {
        const result = remove(shortcut.id); setError(result);
        if (!result && editingId === shortcut.id) close();
      }}><Trash2 size={15} /></button>
    </div>)}
    {(adding || editing) ? <ReminderShortcutEditor key={editing?.id ?? "new"} initial={editing} onCancel={close} onSave={(input) => {
      const result = editing ? update(editing.id, input) : add(input);
      if (!result) close();
      return result;
    }} /> : <button className="cancel-button reminder-shortcut-add" type="button" onClick={() => { setAdding(true); setError(null); }}><Plus size={15} />Add preset</button>}
    {error && <p className="reminder-shortcut-error" role="alert">{error}</p>}
    <p className="reminder-help">Saved on this device and available in every note’s reminder dialog.</p>
  </div>;
}
