import { useCallback, useMemo } from "react";
import { readWorkspacePreference, useWorkspaceId, useWorkspacePreference } from "../features/settings/workspacePreferences";
import { defaultNoteSort, isNoteSort, type NoteSort } from "../features/notes/noteSorting";

const storageKey = "scribe-note-sort";
function readPreferences(raw: string | null): Record<string, NoteSort> {
  try {
    const stored: unknown = JSON.parse(raw ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, NoteSort] => isNoteSort(entry[1])));
  } catch { return {}; }
}

export function useNoteSortPreferences(viewKey: string) {
  const workspaceId = useWorkspaceId();
  const [raw, setPreferences] = useWorkspacePreference(storageKey);
  const preferences = useMemo(() => readPreferences(raw), [raw]);
  const setSortOrder = useCallback((value: NoteSort) => {
    // Merge with saved views so switching folders never discards their choices.
    const next = { ...readPreferences(readWorkspacePreference(workspaceId, storageKey)), [viewKey]: value };
    try { setPreferences(JSON.stringify(next)); }
    catch { /* Keep the last saved preference if device storage is unavailable. */ }
  }, [workspaceId, viewKey, setPreferences]);

  return { sortOrder: preferences[viewKey] ?? defaultNoteSort, setSortOrder };
}
