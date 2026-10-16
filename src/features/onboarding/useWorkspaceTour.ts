import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceId, useWorkspacePreference } from '../settings/workspacePreferences';

export const workspaceTourEvent = 'scribe:workspace-tour';
export const workspaceTourSeenPreference = 'scribe-welcome-tour-v1';
export function useWorkspaceTour(ready: boolean, onStart: () => void) {
  const workspaceId = useWorkspaceId();
  const [seen, saveSeen] = useWorkspacePreference(workspaceTourSeenPreference);
  const [requested, setRequested] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [position, setPosition] = useState({ workspaceId: null as string | null, step: 'welcome' });
  const [practice, setPractice] = useState<{ workspaceId: string | null; noteId: string | null }>({ workspaceId: null, noteId: null });
  const practiceNoteId = practice.workspaceId === workspaceId ? practice.noteId : null;
  const rememberPracticeNote = useCallback((noteId: string) => setPractice({ workspaceId, noteId }), [workspaceId]);
  const step = position.workspaceId === workspaceId ? position.step : 'welcome';
  const goTo = useCallback((next: string) => setPosition({ workspaceId, step: next }), [workspaceId]);
  const open = Boolean(ready && workspaceId && (requested === workspaceId || (!seen && dismissed !== workspaceId)));
  const close = useCallback(() => {
    if (!workspaceId) return;
    try { saveSeen('seen'); } catch { /* A tour must never block use when storage is unavailable. */ }
    setDismissed(workspaceId); setRequested(null);
  }, [workspaceId, saveSeen]);
  useEffect(() => {
    const start = () => {
      // Remember a replay requested while the saved workspace is still loading.
      if (!workspaceId) return;
      setPosition({ workspaceId, step: 'welcome' });
      setPractice({ workspaceId, noteId: null });
      setRequested(workspaceId); onStart();
    };
    window.addEventListener(workspaceTourEvent, start);
    return () => window.removeEventListener(workspaceTourEvent, start);
  }, [workspaceId, onStart]);
  return { open, close, step, goTo, practiceNoteId, rememberPracticeNote };
}
