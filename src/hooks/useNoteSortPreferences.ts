import { useCallback, useState } from "react";
import { defaultNoteSort, isNoteSort, type NoteSort } from "../features/notes/noteSorting";

const storageKey = "scribe-note-sort";
function readPreferences(): Record<string, NoteSort> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, NoteSort] => isNoteSort(entry[1])));
  } catch { return {}; }
}

export function useNoteSortPreferences(viewKey: string) {
  const [preferences, setPreferences] = useState(readPreferences);
  const setSortOrder = useCallback((value: NoteSort) => {
    // Merge with saved views so switching folders never discards their choices.
    const next = { ...readPreferences(), ...preferences, [viewKey]: value };
    setPreferences(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { /* Keep the selected order in memory if device storage is unavailable. */ }
  }, [preferences, viewKey]);

  return { sortOrder: preferences[viewKey] ?? defaultNoteSort, setSortOrder };
}
