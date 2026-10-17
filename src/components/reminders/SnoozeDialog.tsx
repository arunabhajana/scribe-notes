import { useState } from 'react';
import { WorkspaceDialog } from '../notes/WorkspaceDialog';

export function SnoozeDialog({ title, onSave, onClose }: { title: string; onSave: (dueAt: string) => Promise<string | null>; onClose: () => void }) {
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(time: number) {
    if (!Number.isFinite(time) || time <= Date.now()) { setError('Choose a time in the future.'); return; }
    setBusy(true); setError('');
    try { const issue = await onSave(new Date(time).toISOString()); if (issue) setError(issue); else onClose(); }
    catch { setError('Could not snooze this reminder. Please try again.'); }
    finally { setBusy(false); }
  }
  return <WorkspaceDialog title="Snooze reminder" onClose={() => { if (!busy) onClose(); }}>
    <h3>{title || 'Untitled note'}</h3><p>Choose when to be reminded again. The new time saves on this device and syncs when cloud sync is enabled. Scribe must be running to notify you.</p>
    <div className="workspace-actions">{[5, 15, 60].map(minutes => <button type="button" key={minutes} disabled={busy} onClick={() => void save(Date.now() + minutes * 60_000)}>{minutes === 60 ? 'One hour' : `${minutes} minutes`}</button>)}</div>
    <label>Custom time<input type="datetime-local" value={custom} disabled={busy} onChange={event => setCustom(event.target.value)}/></label><button type="button" disabled={busy || !custom} onClick={() => void save(new Date(custom).getTime())}>Snooze until this time</button>
    {error && <p role="alert">{error}</p>}
  </WorkspaceDialog>;
}
