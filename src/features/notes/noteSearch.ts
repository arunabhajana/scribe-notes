import type { Note } from '../../types/note';

// A WeakMap releases cached text when its note object is replaced or unloaded.
const searchText = new WeakMap<Note, string>();
export type SearchField = 'all' | 'title' | 'body';
export type NoteSearchFilters = { field: SearchField; pinned: boolean; reminder: boolean };
export const defaultSearchFilters: NoteSearchFilters = { field: 'all', pinned: false, reminder: false };

// Quoted phrases stay together; other words can occur anywhere in the note.
export function searchTerms(query: string) {
  return [...query.matchAll(/"([^"]+)"|([^\s"]+)/g)].map(match => (match[1] ?? match[2]).toLocaleLowerCase()).filter(Boolean);
}
export function matchesNoteSearch(note: Note, query: string, field: SearchField = 'all', terms = searchTerms(query)) {
  if (!query) return true;
  let text = field === 'all' ? searchText.get(note) : note[field].toLocaleLowerCase();
  if (text === undefined) { text = `${note.title}\n${note.body}`.toLocaleLowerCase(); if (text.length <= 64_000) searchText.set(note, text); }
  return terms.every(term => text.includes(term));
}

export function searchSnippet(body: string, query: string) {
  const lower = body.toLocaleLowerCase();
  const offsets = searchTerms(query).map(term => lower.indexOf(term)).filter(index => index >= 0);
  const start = Math.max(0, (offsets.length ? Math.min(...offsets) : 0) - 55);
  return `${start ? '…' : ''}${body.slice(start, start + 230).replace(/\s+/g, ' ')}${body.length > start + 230 ? '…' : ''}`;
}
