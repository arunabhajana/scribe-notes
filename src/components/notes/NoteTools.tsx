import { lazy, Suspense, useEffect, useState } from 'react';
import type { Note, NoteFolder, NotePatch } from '../../types/note';
import { offlineStore } from '../../features/notes/offlineStore';
import type { ConflictRecord } from '../../features/notes/noteHistory';
import './workspaceTools.css';

const NoteHistoryDialog = lazy(() => import('./NoteHistoryDialog').then(module => ({ default: module.NoteHistoryDialog })));
const SaveRecoveryDialog = lazy(() => import('./SaveRecoveryDialog').then(module => ({ default: module.SaveRecoveryDialog })));
const ConflictDialog = lazy(() => import('./ConflictDialog').then(module => ({ default: module.ConflictDialog })));

export type NoteTool = 'history' | 'recovery' | 'conflicts' | null;
export function NoteTools({ userId, notes, folders, selected, saveStatus, tool, onTool, onUpdate, onOpen, onRetry }: {
  userId: string; notes: Note[]; folders: NoteFolder[]; selected: Note | null; saveStatus: 'saved' | 'saving' | 'failed';
  tool: NoteTool; onTool: (tool: NoteTool) => void;
  onUpdate: (id: string, patch: NotePatch) => void; onOpen: (id: string) => void; onRetry: () => void;
}) {
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [readError, setReadError] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => { void offlineStore.conflicts(userId).then(rows => { if (active) { setConflicts(rows); setReadError(false); } }).catch(() => { if (active) setReadError(true); }); }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [userId, notes]);
  return <>
    {conflicts.length > 0 && <button type="button" className="note-footer-action" title="Review notes with conflicting changes" onClick={() => onTool('conflicts')}>{conflicts.length} {conflicts.length === 1 ? 'conflict' : 'conflicts'}</button>}
    {saveStatus === 'failed' && <button type="button" className="note-footer-action is-error" onClick={() => onTool('recovery')}>Recover edits</button>}
    {readError && <button type="button" className="note-footer-action" title="Conflict details could not be loaded. Open to review." onClick={() => onTool('conflicts')}>Sync details</button>}
    <Suspense fallback={<small role="status">Opening note tools…</small>}>
    {tool === 'history' && selected && <NoteHistoryDialog key={selected.id} userId={userId} note={selected} onRestore={snapshot => onUpdate(selected.id, { title: snapshot.title, body: snapshot.body })} onClose={() => onTool(null)}/>}
    {tool === 'recovery' && <SaveRecoveryDialog userId={userId} notes={notes} folders={folders} onRetry={onRetry} onClose={() => onTool(null)}/>}
    {tool === 'conflicts' && <ConflictDialog userId={userId} notes={notes} conflicts={conflicts} onUpdate={onUpdate} onOpen={onOpen} onResolved={id => setConflicts(current => current.filter(item => item.noteId !== id))} onClose={() => onTool(null)}/>}
    </Suspense>
  </>;
}
