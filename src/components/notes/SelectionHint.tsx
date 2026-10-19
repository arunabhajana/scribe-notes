import { useState } from 'react';
import { X } from 'lucide-react';
import { useWorkspacePreference } from '../../features/settings/workspacePreferences';

export function SelectionHint() {
  const [seen, save] = useWorkspacePreference('scribe-selection-hint-seen');
  const [dismissed, setDismissed] = useState(false);
  if (seen === 'true' || dismissed) return null;
  return <aside className="note-selection-hint" aria-label="Selecting notes">
    <p><strong>Select several notes</strong><span>Ctrl-click to add, Shift-click for a range, or drag across notes. Right-click for actions.</span></p>
    <button type="button" aria-label="Dismiss selection tip" onClick={() => { setDismissed(true); try { save('true'); } catch { /* Dismiss for this session if storage is unavailable. */ } }}><X size={14}/></button>
  </aside>;
}
