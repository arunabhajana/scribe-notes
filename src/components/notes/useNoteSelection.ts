import { useCallback, useMemo, useRef, useState } from 'react';
import type { Note } from '../../types/note';

export function useNoteSelection(notes: Note[], openedId: string | null) {
  const [ids, setIds] = useState<Set<string> | null>(null);
  const anchor = useRef<string | null>(null);
  const selected = useMemo(() => new Set(notes.filter(note => ids?.has(note.id)).map(note => note.id)), [notes, ids]);
  const click = useCallback((id: string, additive: boolean, range: boolean) => {
    if (range) {
      const start = notes.findIndex(note => note.id === (anchor.current ?? openedId ?? id));
      const end = notes.findIndex(note => note.id === id);
      const rangeIds = notes.slice(Math.max(0, Math.min(start, end)), Math.max(start, end) + 1).map(note => note.id);
      setIds(current => new Set([...(additive ? current ?? [] : []), ...rangeIds]));
    } else if (additive) {
      setIds(current => {
        const next = new Set(current ?? (openedId ? [openedId] : []));
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      anchor.current = id;
    } else { setIds(new Set([id])); anchor.current = id; }
  }, [notes, openedId]);
  const replace = useCallback((next: string[]) => {
    setIds(current => current && current.size === next.length && next.every(id => current.has(id)) ? current : new Set(next));
    anchor.current = next[0] ?? null;
  }, []);
  const clear = useCallback(() => { setIds(null); anchor.current = null; }, []);
  return { selected, explicit: ids !== null, click, replace, clear };
}
