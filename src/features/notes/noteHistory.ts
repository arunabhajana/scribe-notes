import type { Note } from '../../types/note';

export const HISTORY_PREFERENCE = 'scribe-note-history';
export type NoteSnapshot = { id: string; savedAt: number; title: string; body: string };
export type HistoryRecord = { key: string; userId: string; noteId: string; snapshots: NoteSnapshot[] };
export type ConflictRecord = { key: string; userId: string; noteId: string; originalId: string; createdAt: number };
const encoder = new TextEncoder();
export function captureHistory(records: HistoryRecord[], userId: string, before: Note, after: Note, checkpoint = false): HistoryRecord[] {
  if (before.deletedAt || after.deletedAt || !checkpoint && before.title === after.title && before.body === after.body) return records;
  if (encoder.encode(before.title + before.body).length > 100_000) return records;
  const key = `${userId}:${before.id}`;
  const previous = records.find(item => item.key === key);
  const last = previous?.snapshots.at(-1);
  if (!checkpoint && last && Date.now() - last.savedAt < 60_000) return records;
  if (last?.title === before.title && last.body === before.body) return records;
  const snapshots = [...previous?.snapshots ?? [], { id: crypto.randomUUID(), savedAt: Date.now(), title: before.title, body: before.body }].slice(-10);
  const next = [...records.filter(item => item.key !== key), { key, userId, noteId: before.id, snapshots }];
  // Retain at most 2 MB per workspace, evicting oldest snapshots first.
  while (encoder.encode(JSON.stringify(next)).length > 2 * 1024 * 1024) {
    const oldest = next.filter(item => item.snapshots.length).sort((a, b) => a.snapshots[0].savedAt - b.snapshots[0].savedAt)[0];
    if (!oldest) break;
    oldest.snapshots.shift();
  }
  return next.filter(item => item.snapshots.length);
}
