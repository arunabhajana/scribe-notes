import { useEffect, useState } from 'react';
import type { Note } from '../../types/note';
import { offlineStore } from '../../features/notes/offlineStore';
import { HISTORY_PREFERENCE, type NoteSnapshot } from '../../features/notes/noteHistory';
import { useWorkspacePreference } from '../../features/settings/workspacePreferences';
import { waitForWorkspaceWrites } from '../../features/transfer/localWriteBarrier';
import { WorkspaceDialog } from './WorkspaceDialog';

export function NoteHistoryDialog({ userId, note, onRestore, onClose }: { userId: string; note: Note; onRestore: (snapshot: NoteSnapshot) => void; onClose: () => void }) {
  const [preference, savePreference] = useWorkspacePreference(HISTORY_PREFERENCE);
  const [snapshots, setSnapshots] = useState<NoteSnapshot[]>([]);
  const [selected, setSelected] = useState<NoteSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void waitForWorkspaceWrites(userId).then(() => offlineStore.noteHistory(userId, note.id)).then(record => { if (active) { setSnapshots(record?.snapshots.slice().reverse() ?? []); setLoaded(true); } }).catch(() => { if (active) setError('Could not load history. Resolve any save error and reopen this dialog.'); });
    return () => { active = false; };
  }, [userId, note.id]);
  async function configure() {
    setBusy(true); setError('');
    try {
      const enabled = preference !== 'true';
      savePreference(String(enabled));
      if (!enabled) { await offlineStore.clearHistory(userId); setSnapshots([]); setSelected(null); }
    } catch { setError('Could not change history. Try again.'); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!selected) return;
    if (new TextEncoder().encode(note.title + note.body).length > 100_000) {
      setError('The current text is too large to preserve in history before replacing it. Export or copy it first, then copy the earlier text from this view if needed.');
      return;
    }
    setBusy(true); setError('');
    try {
      await waitForWorkspaceWrites(userId);
      await offlineStore.checkpointNote(userId, note.id);
      onRestore(selected); onClose();
    } catch { setError('Could not preserve the current text before restoring. Nothing was replaced. Resolve the save error and retry.'); }
    finally { setBusy(false); }
  }
  return <WorkspaceDialog title="Note history" onClose={() => { if (!busy) onClose(); }}>
    <div className="workspace-setting"><div><strong>Keep history on this device</strong><p>Optional for this workspace. Saves earlier text while you edit, at most once a minute: up to 10 versions per note, 100 KB per version and 2 MB total. Older versions are removed first.</p></div><button type="button" role="switch" aria-label="Keep local note history" aria-checked={preference === 'true'} className={`setting-switch${preference === 'true' ? ' checked' : ''}`} disabled={busy} onClick={() => void configure()}><span /></button></div>
    <p className="workspace-muted">History stays on this device and is excluded from sync and exports. Turning it off clears this workspace’s history. Permanently deleting a note or clearing its local workspace removes its history. Versions of larger notes are skipped.</p>
    {error && <p role="alert">{error}</p>}
    {loaded && !snapshots.length && <p>No earlier versions yet. Enable history to keep future edits.</p>}
    {!!snapshots.length && <div className="workspace-compare"><nav aria-label="Earlier versions">{snapshots.map(snapshot => <button type="button" key={snapshot.id} aria-pressed={selected?.id === snapshot.id} onClick={() => setSelected(snapshot)}>{new Date(snapshot.savedAt).toLocaleString()}</button>)}</nav><section>{selected ? <><h3>{selected.title || 'Untitled note'}</h3><pre>{selected.body || 'Empty note'}</pre><button type="button" className="workspace-primary" disabled={busy || Boolean(note.deletedAt)} onClick={() => void restore()}>Restore this text</button><p>Replaces the current title and text. Other note settings stay unchanged. The current text is kept in history first when it fits the retention limits.</p></> : <p>Choose a version to review before restoring.</p>}</section></div>}
    {!!snapshots.length && <button type="button" className="workspace-danger" disabled={busy} onClick={() => { setBusy(true); void offlineStore.clearHistory(userId, note.id).then(() => { setSnapshots([]); setSelected(null); }).catch(() => setError('Could not clear history.')).finally(() => setBusy(false)); }}>Clear this note’s history</button>}
  </WorkspaceDialog>;
}
