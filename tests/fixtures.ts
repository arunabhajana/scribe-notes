import type { Note, NoteFolder } from '../src/types/note'
import type { PortableData } from '../src/features/transfer/transferTypes'

export const workspaceA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const workspaceB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export const timestamp = '2026-01-01T12:00:00.000Z'
export const folder = (patch: Partial<NoteFolder> = {}): NoteFolder => ({
  id: '11111111-1111-4111-8111-111111111111', name: 'Projects', icon: 'folder',
  color: 'violet', sortOrder: 0, createdAt: timestamp, updatedAt: timestamp, ...patch,
})
export const note = (patch: Partial<Note> = {}): Note => ({
  id: '22222222-2222-4222-8222-222222222222', title: 'A note', body: 'Hello **Scribe** 👋',
  folderId: null, pinned: false, isDraft: false, deletedAt: null,
  createdAt: timestamp, updatedAt: timestamp, ...patch,
})
export const portable = (): PortableData => ({
  notes: [note({ folderId: folder().id })], folders: [folder()],
  reminders: [{ noteId: note().id, dueAt: '2099-01-01T12:00:00.000Z', leadMinutes: 5, updatedAt: timestamp }],
})
