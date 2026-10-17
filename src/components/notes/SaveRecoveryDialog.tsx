import { useState } from 'react';
import type { Note, NoteFolder } from '../../types/note';
import { makeBackup } from '../../features/transfer/portableData';
import { saveExport } from '../../features/transfer/saveExport';
import { WorkspaceDialog } from './WorkspaceDialog';

export function SaveRecoveryDialog({ userId, notes, folders, onRetry, onClose }: { userId: string; notes: Note[]; folders: NoteFolder[]; onRetry: () => void; onClose: () => void }) {
  const [selected, setSelected] = useState(notes[0]?.id ?? '');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const note = notes.find(item => item.id === selected);
  return <WorkspaceDialog title="Protect your unsaved edits" onClose={onClose}>
    <p>Keep Scribe open while saving retries. This view uses the text currently in memory, including edits that may not have reached local storage.</p>
    <div className="workspace-actions"><button type="button" onClick={onRetry}>Retry local saves</button><button type="button" disabled={busy} onClick={() => {
      setBusy(true); void (async () => { try {
        const result = await saveExport(userId, makeBackup({ notes, folders, reminders: [] }), 'backup');
        setNotice(result === 'cancelled' ? 'Export cancelled.' : 'Recovery export created. Reminders and preferences are excluded.');
      } catch { setNotice('Export could not finish. Select a note below and copy its text to a file outside Scribe.'); } finally { setBusy(false); } })();
    }}>Export current notes</button></div>
    <label>Review and copy a note<select value={selected} onChange={event => setSelected(event.target.value)}>{notes.map(item => <option key={item.id} value={item.id}>{item.title || 'Untitled note'}</option>)}</select></label>
    <textarea aria-label="Recovery note text" readOnly value={note ? `${note.title}\n\n${note.body}` : ''} onFocus={event => event.currentTarget.select()}/>
    <p className="workspace-muted">Select the text and use Ctrl+C to copy it. Recovery exports contain readable note content; save them somewhere private. Very large workspaces may need copying individual notes instead.</p>
    {notice && <p role="status">{notice}</p>}
  </WorkspaceDialog>;
}
