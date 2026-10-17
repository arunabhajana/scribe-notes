import type { Note } from '../../types/note';

// A WeakMap releases cached text when its note object is replaced or unloaded.
const searchText = new WeakMap<Note, string>();
export function matchesNoteSearch(note: Note, query: string) {
  if (!query) return true;
  let text = searchText.get(note);
  if (text === undefined) { text = `${note.title}\n${note.body}`.toLocaleLowerCase(); if (text.length <= 64_000) searchText.set(note, text); }
  return text.includes(query);
}
