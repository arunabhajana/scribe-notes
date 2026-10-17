import { useState } from 'react';
import type { Note } from '../../types/note';
import type { ConflictRecord } from '../../features/notes/noteHistory';
import { offlineStore } from '../../features/notes/offlineStore';
import { waitForWorkspaceWrites } from '../../features/transfer/localWriteBarrier';
import { WorkspaceDialog } from './WorkspaceDialog';

export function ConflictDialog({ userId, conflicts, notes, onUpdate, onOpen, onResolved, onClose }: {
  userId: string; conflicts: ConflictRecord[]; notes: Note[]; onUpdate: (id: string, patch: { title?: string; body?: string; deletedAt?: string | null }) => void;
  onOpen: (id: string) => void; onResolved: (id: string) => void; onClose: () => void;
}) {
  const [selected, setSelected] = useState(conflicts[0]?.noteId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const record = conflicts.find(item => item.noteId === selected) ?? conflicts[0];
  const local = notes.find(item => item.id === record?.noteId);
  const original = notes.find(item => item.id === record?.originalId);
  async function resolve(useLocal: boolean) {
    if (!record || !local) return;
    setBusy(true); setError('');
    try {
      if (useLocal && original && !original.deletedAt) {
        onUpdate(original.id, { title: local.title.replace(/ \(conflict copy\)$/, ''), body: local.body });
        onUpdate(local.id, { deletedAt: new Date().toISOString() });
        await waitForWorkspaceWrites(userId);
      }
      await offlineStore.resolveConflict(userId, record.noteId);
      onResolved(record.noteId);
      setSelected(conflicts.find(item => item.noteId !== record.noteId)?.noteId ?? '');
    } catch { setError('Could not finish this review. Your copies are kept. Resolve any save error and retry.'); }
    finally { setBusy(false); }
  }
  return <WorkspaceDialog title="Review sync conflicts" onClose={() => { if (!busy) onClose(); }}>
    <p>Both versions were kept when devices changed the same note. Compare them here. Nothing changes until you choose an action.</p>
    {!conflicts.length ? <p>No new note conflicts need review. Earlier releases’ copies can be found by searching for “conflict copy”. Conflicting deletions are canceled rather than copied, and folder conflicts remain separate folders.</p> : <>
      <label>Conflict<select value={record?.noteId ?? ''} disabled={busy} onChange={event => setSelected(event.target.value)}>{conflicts.map(item => <option key={item.noteId} value={item.noteId}>{notes.find(note => note.id === item.noteId)?.title || 'Conflict copy'}</option>)}</select></label>
      <div className="workspace-compare conflict-compare"><section><h3>Current shared note</h3><strong>{original?.title || 'Original no longer available'}</strong><pre>{original?.body ?? 'The original may have been deleted. Your local copy is still available.'}</pre></section><section><h3>Preserved local copy</h3><strong>{local?.title || 'Copy no longer available'}</strong><pre>{local?.body ?? ''}</pre></section></div>
      <div className="workspace-actions"><button type="button" disabled={busy || !local} onClick={() => void resolve(false)}>Keep both · finish review</button><button type="button" disabled={busy || !original || Boolean(original.deletedAt) || !local} onClick={() => void resolve(true)}>Use local text</button><button type="button" disabled={busy || !local} onClick={() => { if (local) { onOpen(local.id); onClose(); } }}>Open local copy</button></div>
      <p className="workspace-muted">Use local text replaces the original’s title and text, keeps its other settings, and moves the extra copy to Trash. To combine versions manually, open the local copy and copy the passages you want. Finishing a review does not disable future conflict protection.</p>
    </>}
    {error && <p role="alert">{error}</p>}
  </WorkspaceDialog>;
}
